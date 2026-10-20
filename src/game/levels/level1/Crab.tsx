import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { State, StateMachine } from 'yuka'
import { G, addAnchor, fx, isHost, localSlot } from '../../runtime'
import { hostSet } from '../../net/replication'
import { envMat, worldBox } from '../../env/blocks'
import { Conveyor, CouplePlate } from '../../env/interactive'
import { GEO, M } from '../../robots/materials'
import { VisorFace } from '../../robots/eyes'
import { BIG, MINI, COLORS } from '../../tuning'
import { applyHit } from '../../robots/miniController'
import { reachCheckpoint } from '../checkpoints'
import { say, useHostLogic } from '../common'
import { completeLevel, useLevelDoneListener } from '../Finish'
import { prompt } from '../../hud'
import { SLOT_NAME } from '../../tuning'

/*
 * Cangrejo clasificador (GDD room 6). A sorting machine, not a fighter: it
 * works its area with telegraphed sweeps and has latches and handles instead
 * of a health bar.
 *   A (separated): hook a latch each and drag it onto the side conveyors.
 *   B (joined):    grip both front handles; one anchors while the other pulls,
 *                  then swap roles to pull the fuse out.
 *   C (joined):    the crab backs off and sweeps low; joint-jump over it while
 *                  carrying the fuse up to the socket.
 */

export const CRAB_HOME = new THREE.Vector3(0, 3.4, -184)
const CRAB_BACK = new THREE.Vector3(7.5, 3.4, -186.5)
const FLOOR = 3.4
const SHOULDER = 2.6
const CLAW_R = 8.6
export const SOCKET = new THREE.Vector3(-7, 4.8, -185.5)

const LATCH = {
  W: { start: -9.6, end: -5.4, z: -175.5, convX: -5, dir: 1 },
  E: { start: 9.6, end: 5.4, z: -175.5, convX: 5, dir: -1 },
} as const

type Phase = 'wait' | 'idle' | 'warnW' | 'sweepW' | 'warnE' | 'sweepE' | 'stunned' | 'retreat' | 'warnLow' | 'sweepLow' | 'rest' | 'down'

const DUR: Partial<Record<Phase, number>> = { idle: 1.6, warnW: 1.0, sweepW: 1.5, warnE: 1.0, sweepE: 1.5, retreat: 2.2, warnLow: 1.1, sweepLow: 2.6, rest: 2.4 }

/** Sweep arcs (angle about each shoulder, 0 = toward +Z). */
const ARC = { W: [-2.2, 0.25], E: [2.2, -0.25] } as const

function clawAngle(side: 'W' | 'E', phase: Phase, k: number) {
  const [a0, a1] = ARC[side]
  const rest = side === 'W' ? -1.4 : 1.4
  if (phase === `warn${side}`) return THREE.MathUtils.lerp(rest, a0, Math.min(1, k * 2))
  if (phase === `sweep${side}`) return THREE.MathUtils.lerp(a0, a1, easeInOut(k))
  return rest
}
const easeInOut = (t: number) => t * t * (3 - 2 * t)

/* ---------------------------------------------------------------- host brain (Yuka FSM) */

class CrabBrain {
  fsm: StateMachine<CrabBrain>
  phase: Phase = 'wait'
  t0 = 0
  constructor() {
    this.fsm = new StateMachine<CrabBrain>(this)
    const cycle: Phase[] = ['idle', 'warnW', 'sweepW', 'idle', 'warnE', 'sweepE']
    const low: Phase[] = ['warnLow', 'sweepLow', 'rest']
    // One timed state per phase; transitions follow the cycle lists.
    for (const p of ['wait', 'idle', 'warnW', 'sweepW', 'warnE', 'sweepE', 'stunned', 'retreat', 'warnLow', 'sweepLow', 'rest', 'down'] as Phase[]) {
      const s = new (class extends State<CrabBrain> {
        idx = 0
        enter(b: CrabBrain) {
          b.phase = p
          b.t0 = G.time
          hostSet('crab', p)
          hostSet('crabT', Math.round(G.time * 1000) / 1000)
          if (p === 'warnW' || p === 'warnE' || p === 'warnLow') fx('sfx', { n: 'alarm', p: CRAB_HOME })
          if (p === 'sweepW' || p === 'sweepE' || p === 'sweepLow') fx('sfx', { n: 'whoosh', p: CRAB_HOME })
        }
        execute(b: CrabBrain) {
          const d = DUR[p]
          if (!d || G.time - b.t0 < d) return
          if (cycle.includes(p)) {
            const i = (cycle.indexOf(p) + 1) % cycle.length
            b.fsm.changeTo(cycle[i] + (cycle[i] === 'idle' ? '' : ''))
          } else if (p === 'retreat') b.fsm.changeTo('rest')
          else if (low.includes(p)) b.fsm.changeTo(low[(low.indexOf(p) + 1) % low.length])
        }
      })()
      this.fsm.add(p, s)
    }
  }
  go(p: Phase) { this.fsm.changeTo(p) }
}

/* ---------------------------------------------------------------- component */

export function CrabRoom() {
  useLevelDoneListener()
  const brain = useMemo(() => new CrabBrain(), [])
  const st = useRef({ started: false, latchW: LATCH.W.start as number, latchE: LATCH.E.start as number, beltW: -1, beltE: -1, pryA: -1, pry: 0, fuse: 'inside' as 'inside' | 'carried' | 'dropped' | 'inserted', lastHit: new Map<string, number>(), winT: -1, objective: '' })

  // Anchors: latch rings, front handles, fuse handles.
  const anchors = useMemo(() => ({
    latchW: addAnchor({ id: 'latchW', kind: 'latch', pos: new THREE.Vector3(LATCH.W.start, FLOOR + 1.3, LATCH.W.z), big: false }),
    latchE: addAnchor({ id: 'latchE', kind: 'latch', pos: new THREE.Vector3(LATCH.E.start, FLOOR + 1.3, LATCH.E.z), big: false }),
    hW: addAnchor({ id: 'hW', kind: 'handle', pos: new THREE.Vector3(-1.05, 5.3, -181.3), mini: false, enabled: false }),
    hE: addAnchor({ id: 'hE', kind: 'handle', pos: new THREE.Vector3(1.05, 5.3, -181.3), mini: false, enabled: false }),
    fW: addAnchor({ id: 'fW', kind: 'handle', pos: new THREE.Vector3(), mini: false, enabled: false }),
    fE: addAnchor({ id: 'fE', kind: 'handle', pos: new THREE.Vector3(), mini: false, enabled: false }),
  }), [])
  useEffect(() => {
    Object.values(anchors).forEach((a) => G.anchors.set(a.id, a))
    return () => Object.values(anchors).forEach((a) => G.anchors.delete(a.id))
  }, [anchors])

  /* ------------------------------------------------ host logic */
  useHostLogic((dt) => {
    const s = st.current
    const phase = brain.phase
    const B = G.big

    // Start when the pair arrives at the arena.
    if (!s.started) {
      const arrived = (B.active && B.pos.z < -166 && B.grounded) || G.minis.some((m) => !m.hidden && m.pos.z < -166 && m.pos.y > FLOOR)
      if (!arrived) return
      s.started = true
      reachCheckpoint('c6')
      say.room('6', 'Cangrejo clasificador', 'Clímax · ambas formas')
      say.mood('boss')
      setObjective(s, G.form === 'joined' ? 'Separaos (mantened Y) para alcanzar los pestillos laterales.' : 'Enganchad cada uno un pestillo (X) y arrastradlo a la cinta con LT.')
      brain.go('idle')
    }
    brain.fsm.update()

    const calibW = !!G.vars.calibW
    const calibE = !!G.vars.calibE
    if (s.started && phase !== 'stunned' && !calibW && !calibE && G.form === 'split') setObjective(s, 'Enganchad cada uno un pestillo (X) y arrastradlo a la cinta con LT. ¡Ojo a las pinzas!')

    /* ---- Phase A: latches ---- */
    for (const side of ['W', 'E'] as const) {
      const L = LATCH[side]
      const key = side === 'W' ? 'latchW' : 'latchE'
      const a = anchors[key]
      let x = side === 'W' ? s.latchW : s.latchE
      const belt = side === 'W' ? s.beltW : s.beltE
      if (belt < 0) {
        // Dragged while a mini reels its hooked cable.
        let pulling = false
        for (const m of G.minis) if (m.cable.state === 'attached' && m.cable.anchorId === key && m.cable.reeling && !m.hidden) pulling = true
        if (pulling) {
          x += L.dir * 1.1 * dt
          if (Math.floor(G.time * 6) !== Math.floor((G.time - dt) * 6)) fx('sfx', { n: 'servo', p: a.pos }, true)
        }
        if ((L.dir > 0 && x >= L.end) || (L.dir < 0 && x <= L.end)) {
          x = L.end
          a.enabled = false
          if (side === 'W') s.beltW = 0; else s.beltE = 0
          fx('sfx', { n: 'clank', p: a.pos })
          say.toast(`¡Pestillo ${side === 'W' ? 'oeste' : 'este'} en la cinta!`, side === 'W' ? 'cyan' : 'amber')
        }
        a.pos.set(x, FLOOR + 1.3, L.z)
        if (side === 'W') s.latchW = x; else s.latchE = x
        hostSet(`latch${side}`, Math.round(x * 100) / 100)
      } else if (belt < 1) {
        const nb = Math.min(1, belt + dt / 4)
        if (side === 'W') s.beltW = nb; else s.beltE = nb
        hostSet(`belt${side}`, Math.round(nb * 100) / 100)
        if (nb >= 1) {
          hostSet(`calib${side}`, 1)
          fx('sfx', { n: 'success', p: CRAB_HOME })
          fx('shake', { a: 0.25 })
        }
      }
    }
    if (calibW && calibE && phase !== 'stunned' && s.fuse === 'inside' && s.pry === 0 && brain.phase !== 'down') {
      brain.go('stunned')
      hostSet('crabOpen', 1)
      reachCheckpoint('c6b')
      say.banner('¡Frontal abierto!', 'Uníos y agarrad las dos asas (RT)', '#ffd23a')
      setObjective(s, 'Acoplaos en la placa y agarrad las dos asas del frontal (mantened RT).')
    }

    /* ---- Claw hits (phase A) ---- */
    if (phase === 'sweepW' || phase === 'sweepE') {
      const side = phase === 'sweepW' ? 'W' : 'E'
      const k = (G.time - brain.t0) / (DUR[phase] ?? 1)
      const ang = clawAngle(side, phase, k)
      const sh = new THREE.Vector3(CRAB_HOME.x + (side === 'W' ? -SHOULDER : SHOULDER), FLOOR, CRAB_HOME.z + 0.6)
      const tip = new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang))
      for (const m of G.minis) {
        if (m.hidden || m.dead) continue
        const rel = new THREE.Vector3(m.pos.x - sh.x, 0, m.pos.z - sh.z)
        const along = rel.dot(tip)
        const perp = rel.clone().addScaledVector(tip, -along).length()
        if (along > 0.5 && along < CLAW_R && perp < 0.9 && m.pos.y - MINI.feet < FLOOR + 1.0) hitRobot(s, `m${m.slot}`, m.slot, rel.normalize())
      }
      if (B.active && !B.dead) {
        const rel = new THREE.Vector3(B.pos.x - sh.x, 0, B.pos.z - sh.z)
        const along = rel.dot(tip)
        const perp = rel.clone().addScaledVector(tip, -along).length()
        if (along > 0.5 && along < CLAW_R && perp < 1.4 && B.pos.y - BIG.feet < FLOOR + 1.2) hitBig(s, rel.normalize())
      }
    }

    /* ---- Phase B: handles, pry, swap ---- */
    const open = phase === 'stunned'
    anchors.hW.enabled = open && s.fuse === 'inside'
    anchors.hE.enabled = open && s.fuse === 'inside'
    if (open && s.fuse === 'inside' && B.active) {
      const g0 = B.arms[0].grip, g1 = B.arms[1].grip
      const both = !!g0 && !!g1 && [g0, g1].every((g) => g === 'hW' || g === 'hE')
      if (both) {
        const anch = [B.legs[0].anchored, B.legs[1].anchored]
        const push = [B.legs[0].push > 0.5, B.legs[1].push > 0.5]
        let who = -1
        if (anch[0] && !anch[1] && push[1]) who = 0
        if (anch[1] && !anch[0] && push[0]) who = 1
        const needed = s.pry < 1 ? (s.pryA < 0 ? who : s.pryA) : s.pryA < 0 ? -1 : 1 - s.pryA
        if (who >= 0 && who === needed) {
          if (s.pryA < 0) s.pryA = who
          const before = s.pry
          s.pry = Math.min(2, s.pry + dt * 0.5)
          if (Math.floor(s.pry * 8) !== Math.floor(before * 8)) fx('sfx', { n: 'servo', p: CRAB_HOME })
          if (before < 1 && s.pry >= 1) {
            fx('sfx', { n: 'clank', p: CRAB_HOME })
            fx('shake', { a: 0.3 })
            say.toast('¡Medio abierto! Ahora intercambiad: el otro ancla y el que anclaba tira.', 'good')
          }
          if (s.pry >= 2) extractFuse(s)
        }
        const a = s.pryA < 0 ? null : s.pry < 1 ? s.pryA : 1 - s.pryA
        hostSet('pryHint', a === null ? -2 : a)
      } else hostSet('pryHint', -1)
      hostSet('pry', Math.round(s.pry * 100) / 100)
    }

    /* ---- Phase C: carry the fuse to the socket ---- */
    if (s.fuse === 'carried' || s.fuse === 'dropped') {
      const fwd = new THREE.Vector3(Math.sin(B.yaw), 0, Math.cos(B.yaw))
      if (s.fuse === 'carried') {
        const fp = B.pos.clone().addScaledVector(fwd, 1.15).setY(B.pos.y + 0.35)
        hostSet('fuseP', [r2(fp.x), r2(fp.y), r2(fp.z)])
        placeFuseHandles(fp, B.yaw)
        const g0 = B.arms[0].grip, g1 = B.arms[1].grip
        if (!B.active || B.dead || !g0 || !g1) {
          s.fuse = 'dropped'
          B.carrying = null
          const drop = B.dead && G.checkpoint?.joined ? G.checkpoint.joined.pos.clone().add(new THREE.Vector3(0, 0.6, -1.5)) : fp.setY(FLOOR + 0.5)
          hostSet('fuseP', [r2(drop.x), r2(drop.y), r2(drop.z)])
          placeFuseHandles(drop, B.yaw)
          hostSet('fuse', 'dropped')
          fx('sfx', { n: 'landHeavy', p: drop })
          say.toast('¡Se os cayó el fusible! Agarradlo los dos (RT).', 'warn')
        } else if (B.pos.distanceTo(new THREE.Vector3(SOCKET.x, SOCKET.y + BIG.feet, SOCKET.z)) < 2.2 && B.grounded) {
          s.fuse = 'inserted'
          B.carrying = null
          for (const arm of B.arms) arm.grip = null
          hostSet('fuse', 'inserted')
          hostSet('fuseP', [SOCKET.x, SOCKET.y + 0.9, SOCKET.z])
          anchors.fW.enabled = anchors.fE.enabled = false
          brain.go('down')
          fx('sfx', { n: 'fuse', p: SOCKET })
          fx('shake', { a: 0.6 })
          say.banner('¡FUSIBLE RECUPERADO!', 'El ascensor al jardín vuelve a tener energía', '#5dff8a')
          say.mood('victory')
          G.medals.add('crab')
          if (G.stats.falls === 0) G.medals.add('noFall')
          s.winT = G.time
        }
      } else {
        const fp = G.vars.fuseP as number[]
        placeFuseHandles(new THREE.Vector3(fp[0], fp[1], fp[2]), 0)
        if (B.active && B.arms[0].grip?.startsWith('f') && B.arms[1].grip?.startsWith('f')) {
          s.fuse = 'carried'
          B.carrying = 'fuse'
          hostSet('fuse', 'carried')
          fx('sfx', { n: 'grab', p: B.pos })
        }
      }
    }
    if (s.winT > 0 && G.time - s.winT > 2.5) {
      s.winT = -1
      completeLevel()
    }

    // Low sweep hits (phase C): jump over it!
    if (phase === 'sweepLow') {
      const k = (G.time - brain.t0) / (DUR.sweepLow ?? 1)
      const ang = lowAngle(k)
      const tip = new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang))
      const c = crabPos(G.vars.crab, G.vars.crabT)
      const check = (p: THREE.Vector3, feet: number, r: number) => {
        const rel = new THREE.Vector3(p.x - c.x, 0, p.z - c.z)
        const along = rel.dot(tip)
        const perp = rel.clone().addScaledVector(tip, -along).length()
        return along > 1 && along < 15 && perp < r && p.y - feet < FLOOR + 0.9 ? rel.normalize() : null
      }
      if (B.active && !B.dead) { const d = check(B.pos, BIG.feet, 1.3); if (d) hitBig(s, d) }
      for (const m of G.minis) if (!m.hidden && !m.dead) { const d = check(m.pos, MINI.feet, 0.8); if (d) hitRobot(s, `m${m.slot}`, m.slot, d) }
    }

    function extractFuse(s: typeof st.current) {
      s.fuse = 'carried'
      B.carrying = 'fuse'
      B.arms[0].grip = 'fW'
      B.arms[1].grip = 'fE'
      anchors.fW.enabled = anchors.fE.enabled = true
      hostSet('fuse', 'carried')
      hostSet('crabOpen', 0)
      fx('sfx', { n: 'fuse', p: CRAB_HOME })
      fx('particles', { n: 'merge', p: { x: 0, y: 5, z: -181 } })
      say.banner('¡Fusible extraído!', 'Llevadlo a la toma: no lo soltéis', '#ffd23a')
      setObjective(s, 'Llevad el fusible a la toma (izquierda). Saltad juntos sobre el barrido bajo.')
      reachCheckpoint('c6c')
      brain.go('retreat')
    }
  })

  function placeFuseHandles(p: THREE.Vector3, yaw: number) {
    const rx = Math.cos(yaw), rz = -Math.sin(yaw)
    anchors.fW.pos.set(p.x + rx * 0.75, p.y + 0.1, p.z + rz * 0.75)
    anchors.fE.pos.set(p.x - rx * 0.75, p.y + 0.1, p.z - rz * 0.75)
    anchors.fW.enabled = anchors.fE.enabled = true
  }

  function setObjective(s: typeof st.current, text: string) {
    if (s.objective === text) return
    s.objective = text
    say.objective(text)
  }

  function hitRobot(s: typeof st.current, key: string, slot: number, dir: THREE.Vector3) {
    const last = s.lastHit.get(key) ?? -9
    if (G.time - last < 1.5) return
    s.lastHit.set(key, G.time)
    const m = G.minis[slot]
    const msg = { slot, d: [dir.x, 0, dir.z], f: 7 }
    if (m.kind === 'remote') G.session?.send('hit', msg)
    else applyHit(m, msg)
    fx('sfx', { n: 'bonk', p: m.pos })
    fx('particles', { n: 'stars', p: m.pos })
  }

  function hitBig(s: typeof st.current, dir: THREE.Vector3) {
    const last = s.lastHit.get('big') ?? -9
    if (G.time - last < 1.5) return
    s.lastHit.set('big', G.time)
    const B = G.big
    if (!B.body) return
    const v = B.body.linvel()
    B.body.setLinvel({ x: v.x + dir.x * 6, y: 6, z: v.z + dir.z * 6 }, true)
    B.stunT = 0.45
    B.launchedT = 0.4
    B.jumpT = G.time
    fx('sfx', { n: 'bonk', p: B.pos })
    fx('shake', { a: 0.35 })
  }


  return (
    <>
      <CrabModel />
      <Latches />
      {/* Side conveyors carry the calibration blocks into the crab's ports */}
      <Conveyor pos={[-5, FLOOR + 0.01, -179]} size={[1.6, 7]} dir={[0, -1]} speed={1.2} />
      <Conveyor pos={[5, FLOOR + 0.01, -179]} size={[1.6, 7]} dir={[0, -1]} speed={1.2} />
      <CouplePlate id="c6plate" pos={[0, FLOOR + 0.02, -175.5]} yaw={Math.PI} radius={2.6} enabledVar="crabOpen" />
      <Socket />
      <Fuse />
      <SweepDecals />
      <PryMeter />
      <CrabPrompts />
    </>
  )
}

const r2 = (x: number) => Math.round(x * 100) / 100

function lowAngle(k: number) {
  // Sweeps the whole front half, right to left.
  return THREE.MathUtils.lerp(-0.1, -Math.PI + 0.1, easeInOut(k))
}

export function crabPos(phase: string | undefined, t0: number | undefined) {
  if (phase === 'retreat') {
    const k = Math.min(1, (G.time - (t0 ?? 0)) / (DUR.retreat ?? 1))
    return CRAB_HOME.clone().lerp(CRAB_BACK, easeInOut(k))
  }
  if (phase === 'warnLow' || phase === 'sweepLow' || phase === 'rest' || phase === 'down') return CRAB_BACK.clone()
  return CRAB_HOME.clone()
}

/* ---------------------------------------------------------------- visuals */

function CrabModel() {
  const root = useRef<THREE.Group>(null!)
  const body = useRef<THREE.Group>(null!)
  const claws = { W: useRef<THREE.Group>(null!), E: useRef<THREE.Group>(null!) }
  const pincers = { W: useRef<THREE.Group>(null!), E: useRef<THREE.Group>(null!) }
  const legs = useRef<THREE.Group>(null!)
  const hatch = useRef<THREE.Group>(null!)
  const lowBar = useRef<THREE.Group>(null!)
  const lamp = useRef<THREE.Mesh>(null!)
  const face = useMemo(() => new VisorFace(['#ff5a3a', '#ff5a3a']), [])
  const visorMat = useMemo(() => new THREE.MeshStandardMaterial({ map: face.tex, emissive: '#ffffff', emissiveMap: face.tex, emissiveIntensity: 1.8, toneMapped: false }), [face])
  const colliderRef = useRef<RapierRigidBody>(null)

  useFrame(() => {
    const phase = G.vars.crab as Phase | undefined
    const t0 = (G.vars.crabT as number | undefined) ?? 0
    const k = phase && DUR[phase] ? Math.min(1, (G.time - t0) / DUR[phase]!) : 0
    const p = crabPos(phase, t0)
    root.current.position.copy(p)
    colliderRef.current?.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z })
    const t = G.time
    const stunned = phase === 'stunned'
    const down = phase === 'down'
    body.current.position.y = 1.7 + (down ? -0.8 : stunned ? -0.3 + Math.sin(t * 3) * 0.05 : Math.sin(t * 2) * 0.08)
    body.current.rotation.z = stunned ? Math.sin(t * 2.2) * 0.06 : 0
    legs.current.children.forEach((l, i) => { l.rotation.x = Math.sin(t * (phase === 'retreat' ? 12 : 2) + i) * (phase === 'retreat' ? 0.35 : 0.08) })
    for (const side of ['W', 'E'] as const) {
      const ang = phase ? clawAngle(side, phase, k) : side === 'W' ? -1.4 : 1.4
      const c = claws[side].current
      c.rotation.y = ang
      const warn = phase === `warn${side}`
      c.position.y = warn ? 1.2 + Math.min(1, k * 2) * 0.8 : 1.2
      c.rotation.x = warn ? -0.25 : phase === `sweep${side}` ? 0.15 : -0.1
      pincers[side].current.rotation.y = warn ? Math.sin(t * 20) * 0.3 : 0.25
    }
    hatch.current.rotation.x = stunned ? -Math.min(1, ((G.vars.pry as number) ?? 0) / 2) * 1.2 - 0.15 : 0
    hatch.current.visible = G.vars.fuse !== 'inserted'
    const lb = lowBar.current
    lb.visible = phase === 'warnLow' || phase === 'sweepLow'
    lb.rotation.y = phase === 'sweepLow' ? lowAngle(k) : -0.1
    lb.position.y = phase === 'warnLow' ? 0.6 + Math.sin(t * 20) * 0.05 : 0.6
    const lm = lamp.current.material as THREE.MeshStandardMaterial
    const alarm = phase?.startsWith('warn')
    lm.emissive.set(alarm ? '#ff3a1a' : stunned ? '#ffd23a' : down ? '#5dff8a' : '#ff9a1f')
    lm.emissiveIntensity = alarm ? 2 + Math.sin(t * 25) * 1.5 : 1.2
    const look = G.form === 'joined' ? G.big.pos : G.minis[localSlot()].pos
    face.draw(down ? 'happy' : stunned ? 'dizzy' : alarm ? 'determined' : 'normal', THREE.MathUtils.clamp((look.x - p.x) / 10, -1, 1), 0)
  })

  const shell = M.accent('#efe4cc')
  const orange = M.accent(COLORS.amberDeep)
  return (
    <>
      <RigidBody ref={colliderRef} type="kinematicPosition" colliders={false} position={CRAB_HOME.toArray()}>
        <CuboidCollider args={[2.6, 1.6, 2.2]} position={[0, 1.8, -0.4]} />
      </RigidBody>
      <group ref={root}>
        <group ref={body} position-y={1.7}>
          <mesh geometry={GEO.rbox(1, 1, 1, 0.3)} material={shell} scale={[5.2, 2.4, 4.2]} castShadow receiveShadow />
          <mesh geometry={GEO.rbox(1, 1, 1, 0.3)} material={orange} position-y={-0.8} scale={[5.4, 0.7, 4.4]} castShadow />
          <mesh geometry={worldBox(5.3, 0.35, 4.3, 1)} material={envMat('hazard')} position-y={-0.35} />
          {/* face */}
          <mesh geometry={GEO.rbox(1, 1, 1, 0.3)} material={M.visor()} position={[0, 0.55, 2.05]} scale={[2.4, 0.9, 0.3]} />
          <mesh material={visorMat} position={[0, 0.55, 2.22]} geometry={GEO.box()} scale={[2.1, 0.7, 0.01]} />
          {/* hatch that hides the fuse */}
          <group ref={hatch} position={[0, -0.2, 2.15]}>
            <mesh geometry={GEO.rbox(1, 1, 1, 0.2)} material={envMat('metal')} position-y={-0.45} scale={[2.6, 1.0, 0.25]} castShadow />
            {[-1, 1].map((s) => <mesh key={s} geometry={GEO.torus()} material={M.glow('#ffcf3a', 0.8)} position={[s * 1.05, -0.4, 0.2]} scale={0.22} />)}
          </group>
          {/* back sorter + lamp */}
          <mesh geometry={worldBox(3, 0.8, 1.8, 1)} material={envMat('metal')} position={[0, 1.5, -1]} castShadow />
          <mesh geometry={GEO.cyl()} material={envMat('dark')} position={[0, 2.1, -1]} scale={[0.15, 0.6, 0.15]} />
          <mesh ref={lamp} geometry={GEO.sphereLo()} position={[0, 2.5, -1]} scale={0.35} material={useMemo(() => new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#ff9a1f', emissiveIntensity: 1.2, toneMapped: false }), [])} />
          {/* eye stalks */}
          {[-1, 1].map((s) => (
            <group key={s} position={[s * 1.2, 1.4, 1.6]}>
              <mesh geometry={GEO.cyl()} material={envMat('dark')} position-y={0.3} scale={[0.08, 0.6, 0.08]} />
              <mesh geometry={GEO.sphere()} material={shell} position-y={0.7} scale={0.28} />
              <mesh geometry={GEO.sphere()} material={M.glow('#ff5a3a', 1.6)} position={[0, 0.72, 0.2]} scale={0.12} />
            </group>
          ))}
        </group>
        <group ref={legs}>
          {[-1, 1].flatMap((s) => [0, 1, 2].map((i) => (
            <group key={`${s}${i}`} position={[s * 2.4, 1.3, 1.2 - i * 1.3]} rotation-z={s * 0.7}>
              <mesh geometry={GEO.capsule()} material={envMat('dark')} position-x={s * 0.8} rotation-z={Math.PI / 2} scale={[0.3, 1.4, 0.3]} castShadow />
              <mesh geometry={GEO.capsule()} material={orange} position={[s * 1.5, -0.8, 0]} scale={[0.26, 1.2, 0.26]} castShadow />
            </group>
          )))}
        </group>
        {/* claws */}
        {(['W', 'E'] as const).map((side) => (
          <group key={side} ref={claws[side]} position={[side === 'W' ? -SHOULDER : SHOULDER, 1.2, 0.6]}>
            <mesh geometry={GEO.sphere()} material={orange} scale={0.6} castShadow />
            <mesh geometry={worldBox(0.55, 0.55, CLAW_R - 1.6, 1)} material={envMat('yellow')} position-z={(CLAW_R - 1.6) / 2} castShadow />
            <mesh geometry={worldBox(0.6, 0.15, CLAW_R - 1.6, 1)} material={envMat('dark')} position={[0, 0.33, (CLAW_R - 1.6) / 2]} />
            <group ref={pincers[side]} position-z={CLAW_R - 1.3}>
              <mesh geometry={GEO.rbox(1, 1, 1, 0.3)} material={shell} scale={[1.2, 0.8, 1.4]} castShadow />
              <mesh geometry={GEO.cone()} material={orange} position={[0.35, 0, 0.9]} rotation-x={Math.PI / 2} scale={[0.3, 1.0, 0.3]} castShadow />
              <mesh geometry={GEO.cone()} material={orange} position={[-0.35, 0, 0.9]} rotation-x={Math.PI / 2} scale={[0.3, 1.0, 0.3]} castShadow />
              {/* padded tip: knocks, never hurts */}
              <mesh geometry={GEO.sphere()} material={envMat('pad')} position-z={0.5} scale={[0.75, 0.55, 0.5]} />
            </group>
          </group>
        ))}
        {/* low sweep bar (phase C) */}
        <group ref={lowBar} visible={false}>
          <mesh geometry={worldBox(0.6, 0.6, 14, 2)} material={envMat('pad')} position={[0, 0, 7.5]} castShadow />
          <mesh geometry={worldBox(0.64, 0.2, 14, 2)} material={envMat('hazard')} position={[0, 0.35, 7.5]} />
        </group>
      </group>
    </>
  )
}

/** Contextual prompts for the handles / pry / fuse beats. */
export function CrabPrompts() {
  useFrame(() => {
    const me = localSlot()
    if (G.form === 'joined' && G.vars.crab === 'stunned' && G.vars.fuse !== 'carried') {
      const B = G.big
      if (!B.arms[me].grip) prompt({ id: 'crabgrip', btn: 'grab', hold: true, text: 'Agarra tu asa del frontal' })
      const h = G.vars.pryHint as number | undefined
      if (h !== undefined && h >= 0) {
        const other = 1 - h
        prompt({ id: 'pry', text: h === me ? `Tú anclas (mantén B) · ${SLOT_NAME[other]} tira con su stick` : `${SLOT_NAME[h]} ancla · tú tira con el stick`, progress: ((G.vars.pry as number) ?? 0) / 2 })
        prompt({ id: 'prykey', btn: h === me ? 'brake' : 'jump', text: h === me ? 'Anclar pierna' : '(stick hacia fuera)' })
      } else if (h === -2) prompt({ id: 'pry0', btn: 'brake', text: 'Uno ancla (B) mientras el otro tira con su stick' })
    }
    if (G.form === 'joined' && G.vars.fuse === 'carried') prompt({ id: 'fusecarry', btn: 'grab', hold: true, text: 'No sueltes el fusible' })
    if (G.form === 'joined' && G.vars.fuse === 'dropped') prompt({ id: 'fusegrab', btn: 'grab', hold: true, text: 'Agarrad el fusible los dos' })
  })
  return null
}

function Latches() {
  const blocks = { W: useRef<THREE.Group>(null!), E: useRef<THREE.Group>(null!) }
  useFrame(() => {
    for (const side of ['W', 'E'] as const) {
      const L = LATCH[side]
      const g = blocks[side].current
      const delivered = !!G.vars[`calib${side}`]
      g.visible = !delivered
      const belt = (G.vars[`belt${side}`] as number | undefined) ?? -1
      if (belt >= 0) g.position.set(L.convX, FLOOR + 0.45, THREE.MathUtils.lerp(L.z, -182.5, belt))
      else g.position.set((G.vars[`latch${side}`] as number | undefined) ?? L.start, FLOOR + 0.45, L.z)
      const a = G.anchors.get(side === 'W' ? 'latchW' : 'latchE')
      if (a && !isHost()) { a.pos.set(g.position.x, FLOOR + 1.3, L.z); a.enabled = belt < 0 }
    }
  })
  return (
    <>
      {(['W', 'E'] as const).map((side) => {
        const L = LATCH[side]
        return (
          <group key={side}>
            {/* rail */}
            <mesh geometry={worldBox(Math.abs(L.end - L.start) + 1.2, 0.12, 0.5, 1)} material={envMat('dark')} position={[(L.start + L.end) / 2, FLOOR + 0.06, L.z]} />
            <group ref={blocks[side]}>
              <mesh geometry={GEO.rbox(1, 1, 1, 0.2)} material={M.accent(side === 'W' ? COLORS.cyan : COLORS.amber)} scale={[0.9, 0.9, 0.9]} castShadow />
              <mesh geometry={worldBox(0.95, 0.2, 0.95, 1)} material={envMat('hazard')} />
              <mesh geometry={GEO.torus()} material={M.glow('#ffbe2e', 0.7)} position-y={0.85} scale={0.32} />
              <mesh geometry={GEO.cyl()} material={envMat('dark')} position-y={0.6} scale={[0.05, 0.3, 0.05]} />
            </group>
          </group>
        )
      })}
    </>
  )
}

function Socket() {
  const glow = useRef<THREE.Mesh>(null!)
  useFrame(() => {
    const m = glow.current.material as THREE.MeshStandardMaterial
    const done = G.vars.fuse === 'inserted'
    m.emissive.set(done ? '#5dff8a' : '#ffcf3a')
    m.emissiveIntensity = done ? 3 : G.vars.fuse === 'carried' ? 1.5 + Math.sin(G.time * 6) : 0.4
  })
  return (
    <group position={SOCKET.toArray()}>
      <mesh geometry={GEO.cyl()} material={envMat('dark')} scale={[1.3, 0.5, 1.3]} position-y={0.25} castShadow />
      <mesh ref={glow} geometry={GEO.torus()} rotation-x={Math.PI / 2} position-y={0.55} scale={1.0} material={useMemo(() => new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#ffcf3a', toneMapped: false }), [])} />
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} geometry={worldBox(0.25, 2.6, 0.25, 1)} material={envMat('yellow')} position={[Math.cos((i * Math.PI) / 2) * 1.5, 1.3, Math.sin((i * Math.PI) / 2) * 1.5]} castShadow />
      ))}
    </group>
  )
}

function Fuse() {
  const g = useRef<THREE.Group>(null!)
  const core = useRef<THREE.Mesh>(null!)
  useFrame(() => {
    const st = G.vars.fuse as string | undefined
    const p = G.vars.fuseP as number[] | undefined
    g.current.visible = !!st && st !== 'inside' && !!p
    if (!g.current.visible || !p) return
    if (st === 'carried' && G.big.active) {
      // Ride the interpolated body on both peers.
      const B = G.big
      const base = B.view?.rootWorld ?? B.pos
      g.current.position.set(base.x + Math.sin(B.yaw) * 1.15, (B.view ? base.y + BIG.feet : B.pos.y) + 0.35, base.z + Math.cos(B.yaw) * 1.15)
      g.current.rotation.y = B.yaw
    } else {
      g.current.position.set(p[0], p[1], p[2])
    }
    g.current.rotation.z = st === 'inserted' ? 0 : Math.PI / 2
    ;(core.current.material as THREE.MeshStandardMaterial).emissiveIntensity = 2 + Math.sin(G.time * 5)
  })
  return (
    <group ref={g} visible={false}>
      <mesh ref={core} geometry={GEO.cyl()} scale={[0.35, 1.2, 0.35]} material={useMemo(() => new THREE.MeshStandardMaterial({ color: '#c9fbff', emissive: '#5ef0ff', emissiveIntensity: 2, toneMapped: false, transparent: true, opacity: 0.9 }), [])} />
      {[-1, 1].map((s) => <mesh key={s} geometry={GEO.cyl()} material={envMat('dark')} position-y={s * 0.7} scale={[0.45, 0.25, 0.45]} castShadow />)}
      {[-1, 1].map((s) => <mesh key={'h' + s} geometry={GEO.torus()} material={envMat('yellow')} position-y={s * 0.75} rotation-x={Math.PI / 2} scale={0.32} />)}
    </group>
  )
}

/** Red sector decals on the floor during telegraphs (GDD: redundant warning). */
function SweepDecals() {
  const W = useRef<THREE.Mesh>(null!)
  const E = useRef<THREE.Mesh>(null!)
  const low = useRef<THREE.Mesh>(null!)
  // RingGeometry lies in XY; after rotating onto the floor, ring angle θ points
  // to world (cos θ, -sin θ) while our sweep angle α points to (sin α, cos α): θ = α - π/2.
  const arc = (a: number, b: number, r0: number, r1: number) => new THREE.RingGeometry(r0, r1, 40, 1, Math.min(a, b) - Math.PI / 2, Math.abs(b - a))
  const geos = useMemo(() => ({ W: arc(ARC.W[0], ARC.W[1], 1, CLAW_R), E: arc(ARC.E[0], ARC.E[1], 1, CLAW_R), low: arc(-Math.PI + 0.1, -0.1, 1, 15) }), [])
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ff3a1a', transparent: true, opacity: 0.3, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }), [])
  useFrame(() => {
    const ph = G.vars.crab as string | undefined
    const pulse = 0.25 + Math.abs(Math.sin(G.time * 10)) * 0.25
    mat.opacity = pulse
    W.current.visible = ph === 'warnW' || ph === 'sweepW'
    E.current.visible = ph === 'warnE' || ph === 'sweepE'
    low.current.visible = ph === 'warnLow' || ph === 'sweepLow'
    const c = crabPos(ph, G.vars.crabT)
    low.current.position.set(c.x, FLOOR + 0.04, c.z)
  })
  // Ring geometry lies in XY; rotate to the floor. Angle 0 of our sweep (+Z) maps to the ring's +Y.
  return (
    <>
      <mesh ref={W} geometry={geos.W} material={mat} rotation-x={-Math.PI / 2} position={[CRAB_HOME.x - SHOULDER, FLOOR + 0.04, CRAB_HOME.z + 0.6]} visible={false} />
      <mesh ref={E} geometry={geos.E} material={mat} rotation-x={-Math.PI / 2} position={[CRAB_HOME.x + SHOULDER, FLOOR + 0.04, CRAB_HOME.z + 0.6]} visible={false} />
      <mesh ref={low} geometry={geos.low} material={mat} rotation-x={-Math.PI / 2} visible={false} />
    </>
  )
}

/** World-space pry progress over the crab front. */
function PryMeter() {
  const g = useRef<THREE.Group>(null!)
  const bar = useRef<THREE.Mesh>(null!)
  useFrame(() => {
    const on = G.vars.crab === 'stunned' && G.form === 'joined'
    g.current.visible = on
    if (!on) return
    const p = (G.vars.pry as number) ?? 0
    bar.current.scale.x = Math.max(0.001, p / 2) * 3
    bar.current.position.x = -1.5 + (p / 2) * 1.5
    g.current.lookAt(G.cam.pos)
  })
  return (
    <group ref={g} position={[0, 8.2, -181]} visible={false}>
      <mesh geometry={GEO.box()} material={M.basic('#10131a', 0.75)} scale={[3.2, 0.32, 0.02]} />
      <mesh ref={bar} geometry={GEO.box()} material={M.basic('#ffd23a')} scale={[0.01, 0.22, 0.03]} />
      <mesh geometry={GEO.box()} material={M.basic('#ffffff', 0.6)} scale={[0.04, 0.4, 0.04]} />
    </group>
  )
}
