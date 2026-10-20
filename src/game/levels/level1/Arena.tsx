import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { G, fx, isHost, localMini, onAct, onFx } from '../../runtime'
import { hostSet } from '../../net/replication'
import { Block, Banner, Scaffold } from '../../env/blocks'
import { SpringPad, Sign, robotsIn } from '../../env/interactive'
import { Bell, Wall } from '../../env/props2'
import { GEO, M } from '../../robots/materials'
import { SLOT_COLOR, SLOT_NAME } from '../../tuning'
import { useHud } from '../../hud'
import { respawnMini } from '../../robots/miniController'
import { say, useHostLogic } from '../common'
import { sfx } from '../../../core/audio'

/*
 * Carrera de muelles (GDD room 3): optional one-minute arena. Double consent
 * to enter, two 20 s rounds with swapped starts, your own bells to ring,
 * playful shoves allowed (the shove costs the same cable you'd use to score).
 * Ties allowed; the winner only gets a session sticker.
 */

export const ARENA_C = new THREE.Vector3(24, 2.4, -58)
const BELLS: [string, [number, number, number]][] = [
  ['b1', [18, 2.4, -52]], ['b2', [24, 2.4, -51.5]], ['b3', [30, 2.4, -52]],
  ['b4', [18, 2.4, -64]], ['b5', [24, 2.4, -64.5]], ['b6', [30, 2.4, -64]],
]
const START: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(19.5, 3.2, -58), new THREE.Vector3(28.5, 3.2, -58)]
const PADS: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(5.2, 2.4, -53.5), new THREE.Vector3(7.8, 2.4, -53.5)]

type Phase = 'off' | 'intro' | 'r1' | 'swap' | 'r2' | 'results'
const LEN: Record<Phase, number> = { off: 0, intro: 5, r1: 20, swap: 3, r2: 20, results: 6 }

export function Arena() {
  const st = useRef({ phase: 'off' as Phase, t0: 0, consentT: 0, played: false, relight: [] as { at: number; owner: 0 | 1 }[] })

  // Each owner teleports their own robot.
  useEffect(() => onFx('arenaTp', (e: { to: number[][]; yaw: number }) => {
    const m = localMini()
    const ai = G.minis.find((x) => x.kind === 'ai')
    for (const r of [m, ai]) {
      if (!r) continue
      const p = e.to[r.slot]
      respawnMini(r, new THREE.Vector3(p[0], p[1], p[2]), e.yaw)
    }
  }), [])

  useEffect(() => onAct('bell', (slot, d: { id: string }) => ring(d.id, slot)), [])

  function ring(id: string, slot: number) {
    const s = st.current
    if (s.phase !== 'r1' && s.phase !== 'r2') return
    const owner = G.vars[`bell:${id}`]
    if (owner !== slot) return
    hostSet(`bell:${id}`, -1)
    hostSet(`bellT:${id}`, G.time)
    const key = `arenaS${slot}`
    hostSet(key, ((G.vars[key] as number) ?? 0) + 1)
    G.stats.bells[slot as 0 | 1]++
    const b = BELLS.find((x) => x[0] === id)!
    fx('sfx', { n: 'bell', p: new THREE.Vector3(b[1][0], b[1][1] + 2.2, b[1][2]) })
    fx('particles', { n: 'ring', p: { x: b[1][0], y: b[1][1] + 2.2, z: b[1][2] }, c: SLOT_COLOR[slot as 0 | 1] })
    s.relight.push({ at: G.time + 1.3, owner: slot as 0 | 1 })
  }

  function lightRandom(owner: 0 | 1) {
    const free = BELLS.filter(([id]) => !(G.vars[`bell:${id}`] === 0 || G.vars[`bell:${id}`] === 1))
    if (!free.length) return
    const pick = free[Math.floor(Math.random() * free.length)]
    hostSet(`bell:${pick[0]}`, owner)
  }

  useHostLogic(() => {
    const s = st.current
    const now = G.time
    const go = (p: Phase) => {
      s.phase = p
      s.t0 = now
      hostSet('arenaPhase', p)
      hostSet('arenaT0', Math.round(now * 1000) / 1000)
    }
    if (s.phase === 'off') {
      // Double consent: one robot on each pad for a second.
      if (G.form !== 'split') return
      const on = PADS.map((p) => robotsIn(p, new THREE.Vector3(0.9, 0.8, 0.9)).filter((w) => w !== 'big'))
      const both = on[0].length > 0 && on[1].length > 0 && new Set([...on[0], ...on[1]]).size === 2
      hostSet('arenaPads', (on[0].length ? 1 : 0) + (on[1].length ? 2 : 0))
      s.consentT = both ? s.consentT + 1 / 60 : 0
      if (s.consentT > 1) {
        s.consentT = 0
        hostSet('arenaS0', 0)
        hostSet('arenaS1', 0)
        hostSet('arenaLive', 0)
        fx('arenaTp', { to: [START[0].toArray(), START[1].toArray()], yaw: -Math.PI / 2 })
        say.room('3', 'Carrera de muelles', 'Prueba opcional · 1 minuto')
        say.mood('arena')
        go('intro')
      }
      return
    }
    const el = now - s.t0
    if (el < LEN[s.phase]) {
      if ((s.phase === 'r1' || s.phase === 'r2') && s.relight.length) {
        s.relight = s.relight.filter((r) => { if (r.at > now) return true; lightRandom(r.owner); return false })
      }
      return
    }
    switch (s.phase) {
      case 'intro':
        startRound()
        go('r1')
        break
      case 'r1':
        clearBells()
        hostSet('arenaLive', 0)
        fx('arenaTp', { to: [START[1].toArray(), START[0].toArray()], yaw: Math.PI / 2 })
        go('swap')
        break
      case 'swap':
        startRound()
        go('r2')
        break
      case 'r2': {
        clearBells()
        hostSet('arenaLive', 0)
        const a = (G.vars.arenaS0 as number) ?? 0
        const b = (G.vars.arenaS1 as number) ?? 0
        const w = a === b ? -1 : a > b ? 0 : 1
        hostSet('arenaWinner', w)
        if (w >= 0) G.stats.arenaWins[w as 0 | 1]++
        G.medals.add('bells')
        fx('arenaEnd', { w, a, b })
        go('results')
        break
      }
      case 'results': {
        const cp = G.checkpoint!
        fx('arenaTp', { to: [cp.spawns[0].toArray(), cp.spawns[1].toArray()], yaw: cp.yaw })
        say.mood('explore')
        s.played = true
        go('off')
        break
      }
    }

    function startRound() {
      clearBells()
      hostSet('arenaLive', 1)
      s.relight = []
      lightRandom(0); lightRandom(1); lightRandom(0); lightRandom(1)
      fx('sfx', { n: 'go' })
    }
    function clearBells() { for (const [id] of BELLS) hostSet(`bell:${id}`, -1) }
  })

  // Touch to ring: jump into your lit bell. Each owner checks their own robot.
  useFrame(() => {
    const ph = G.vars.arenaPhase as Phase | undefined
    if (ph !== 'r1' && ph !== 'r2') return
    const m = localMini()
    if (m.hidden || m.dead) return
    for (const [id, p] of BELLS) {
      if (G.vars[`bell:${id}`] !== m.slot) continue
      const dx = m.pos.x - p[0], dz = m.pos.z - p[2]
      const head = m.pos.y + 0.5
      if (Math.hypot(dx, dz) < 1.0 && head > p[1] + 1.75 && head < p[1] + 3) {
        const key = `touched:${id}`
        const last = (G.vars as any)[key] ?? 0
        if (G.time - last > 0.5) {
          ;(G.vars as any)[key] = G.time
          if (isHost()) ring(id, m.slot)
          else G.session?.send('act', { k: 'bell', d: { id } })
        }
      }
    }
  })

  // HUD mirror of the arena state (both peers).
  useFrame(() => {
    const ph = (G.vars.arenaPhase as Phase | undefined) ?? 'off'
    const hud = useHud.getState()
    if (ph === 'off') { if (hud.arena) useHud.setState({ arena: null }); return }
    const t0 = (G.vars.arenaT0 as number) ?? G.time
    const left = Math.max(0, LEN[ph] - (G.time - t0))
    const label = { off: '', intro: 'Preparados', r1: 'Ronda 1', swap: 'Cambio de lado', r2: 'Ronda 2', results: 'Resultado' }[ph]
    const scores: [number, number] = [(G.vars.arenaS0 as number) ?? 0, (G.vars.arenaS1 as number) ?? 0]
    const a = hud.arena
    if (!a || a.phase !== label || Math.ceil(a.time) !== Math.ceil(left) || a.scores[0] !== scores[0] || a.scores[1] !== scores[1]) {
      if (ph === 'intro' && a?.phase === label && Math.ceil(left) !== Math.ceil(a.time) && left < 3.5) sfx('tick')
      useHud.setState({ arena: { round: ph === 'r2' || ph === 'swap' || ph === 'results' ? 2 : 1, time: left, scores, phase: label } })
    }
  })

  useEffect(() => onFx('arenaEnd', (e: { w: number; a: number; b: number }) => {
    const winner = e.w < 0 ? null : SLOT_NAME[e.w as 0 | 1]
    fx('banner', { title: winner ? `¡Gana ${winner}!` : '¡Empate!', sub: `${e.a} – ${e.b} campanas · nadie pierde nada, es solo por el pique`, color: e.w < 0 ? '#ffffff' : SLOT_COLOR[e.w as 0 | 1] }, false)
    if (e.w >= 0) useHud.setState((s) => ({ stickers: [...s.stickers, e.w === 0 ? '🔔' : '🛎️'] }))
    sfx('fanfare')
  }), [])

  return (
    <>
      {/* Consent pads on D */}
      <ConsentPads />
      <Sign pos={[6.5, 4.6, -51.6]} rotY={Math.PI} text="Carrera de muelles" sub="opcional · subid los dos" small />
      <Banner pos={[6.5, 6.6, -51.2]} rotY={Math.PI} color="#ff9a1f" />

      {/* Arena platform */}
      <Block pos={ARENA_C.toArray() as [number, number, number]} size={[16, 10, 16]} />
      <mesh geometry={GEO.cyl()} material={M.accent('#ffe1b3')} position={[ARENA_C.x, ARENA_C.y + 0.02, ARENA_C.z]} scale={[6, 0.04, 6]} receiveShadow />
      <mesh geometry={GEO.torus()} material={M.accent('#ff9a1f')} rotation-x={Math.PI / 2} position={[ARENA_C.x, ARENA_C.y + 0.05, ARENA_C.z]} scale={[6, 6, 0.6]} />
      {/* Padded walls keep the scuffle inside */}
      <Wall pos={[ARENA_C.x, ARENA_C.y, ARENA_C.z - 7.9]} size={[16, 1.2, 0.4]} kind="pad" />
      <Wall pos={[ARENA_C.x, ARENA_C.y, ARENA_C.z + 7.9]} size={[16, 1.2, 0.4]} kind="pad" />
      <Wall pos={[ARENA_C.x - 7.9, ARENA_C.y, ARENA_C.z]} size={[0.4, 1.2, 16]} kind="pad" />
      <Wall pos={[ARENA_C.x + 7.9, ARENA_C.y, ARENA_C.z]} size={[0.4, 1.2, 16]} kind="pad" />
      {BELLS.map(([id, p]) => <Bell key={id} id={id} pos={p} />)}
      <SpringPad pos={[ARENA_C.x - 3, ARENA_C.y, ARENA_C.z]} bounce={14} />
      <SpringPad pos={[ARENA_C.x + 3, ARENA_C.y, ARENA_C.z]} bounce={14} />
      <Scaffold pos={[ARENA_C.x + 9.5, ARENA_C.y - 10, ARENA_C.z - 9]} h={22} />
      <Scaffold pos={[ARENA_C.x - 9.5, ARENA_C.y - 10, ARENA_C.z + 9]} h={22} />
      <Banner pos={[ARENA_C.x, ARENA_C.y + 6, ARENA_C.z - 8.2]} color="#22c7d6" />
      <Banner pos={[ARENA_C.x + 3, ARENA_C.y + 6, ARENA_C.z - 8.2]} color="#ff9a1f" />
    </>
  )
}

function ConsentPads() {
  const rings = [useRef<THREE.Mesh>(null!), useRef<THREE.Mesh>(null!)]
  useFrame(() => {
    const occ = (G.vars.arenaPads as number) ?? 0
    const off = ((G.vars.arenaPhase as string) ?? 'off') === 'off'
    for (let i = 0; i < 2; i++) {
      const r = rings[i].current
      r.visible = off
      const on = !!(occ & (1 << i))
      ;(r.material as THREE.MeshBasicMaterial).opacity = on ? 0.95 : 0.4 + Math.sin(G.time * 4 + i) * 0.1
      r.scale.setScalar(on ? 1.1 : 0.95)
    }
  })
  const mats = useMemo(() => SLOT_COLOR.map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.5, toneMapped: false })), [])
  return (
    <>
      {PADS.map((p, i) => (
        <group key={i} position={p.toArray()}>
          <mesh geometry={GEO.cyl()} material={M.accent(SLOT_COLOR[i])} scale={[0.95, 0.06, 0.95]} position-y={0.03} receiveShadow />
          <mesh ref={rings[i]} geometry={GEO.ringFlat()} material={mats[i]} rotation-x={-Math.PI / 2} position-y={0.08} />
          <mesh geometry={GEO.box()} material={M.basic('#ffffff')} position-y={0.08} scale={[0.35, 0.02, 0.1]} />
        </group>
      ))}
    </>
  )
}

