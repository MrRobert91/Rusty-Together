import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { interactionGroups, useBeforePhysicsStep } from '@react-three/rapier'
import * as RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three'
import type { World } from '@dimforge/rapier3d-compat'
import {
  G, act, camRelative, clamp, fx, isHost, localMini, localSlot, onAct, peerMini, peerSlot, type Mini,
} from './runtime'
import { consumeHuman, newStepInput, pollHuman, clearEdges, human, type StepInput } from './control'
import { applyHit, carryPoint, respawnMini, stepMini } from './robots/miniController'
import { bigWantsSplit, newPilotFrame, resetBigLocals, stepBig, type PilotFrame } from './robots/bigController'
import {
  clearBigBuffer, clearBuffers, encodeMini, encodeWorld, hostSet, onVar, receiveMiniPose, receiveWorld, sampleBig,
  sampleBodies, sampleMini, type MiniPose, type WorldSnap,
} from './net/replication'
import { BIG, MINI, NET } from './tuning'
import { setPushToTalk, toggleMute } from '../net/voice'
import { sfx, stinger } from '../core/audio'
import { useHud, toast } from './hud'
import { lineOfSight } from './robots/physicsUtil'

/** Plates where the minis can couple. Registered by levels. */
export interface Plate { id: string; pos: THREE.Vector3; radius: number; yaw: number; enabled: () => boolean }
export const plates = new Map<string, Plate>()

/** Optional AI driver for the solo partner (tutorial). */
export const aiDriver: { mini: ((inp: StepInput, dt: number) => void) | null; pilot: ((pf: PilotFrame, local: PilotFrame, dt: number) => void) | null } = { mini: null, pilot: null }

if (import.meta.env.DEV) (window as any).__aiDriver = aiDriver

/** Whether joined bodies may split right now (levels can forbid it). */
export const formRules = { canSplit: (_p: THREE.Vector3) => true }

const ROBOT_GROUPS = interactionGroups(1, [0, 1, 2, 3])
const GHOST_GROUPS = interactionGroups(1, [0, 2, 3])
const ghostState = new WeakMap<Mini, boolean>()

const localIn = newStepInput()
const aiIn = newStepInput()
const pilots: [PilotFrame, PilotFrame] = [newPilotFrame(), newPilotFrame()]
const remotePilot = newPilotFrame()
const aimOff = { yaw: 0, pitch: 0.35 }
const tmp = new THREE.Vector3()
const tmp2 = new THREE.Vector3()

function aimFromCamera(out: THREE.Vector3) {
  out.copy(G.cam.fwd)
  out.y += 0.28
  return out.normalize()
}

function pilotAim(out: THREE.Vector3) {
  const a = G.cam.yaw + aimOff.yaw + Math.PI
  const p = aimOff.pitch
  return out.set(Math.sin(a) * Math.cos(p), Math.sin(p), Math.cos(a) * Math.cos(p))
}

function fillLocalPilot(pf: PilotFrame, inp: StepInput) {
  camRelative(inp.stick, G.cam.yaw, pf.move)
  pilotAim(pf.aim)
  pf.brake = inp.held.brake
  pf.couple = inp.held.couple
  pf.grab = inp.held.grab
  pf.reel = inp.held.secondary
  if (inp.pressed.jump) pf.jumps.push(G.time)
  if (inp.pressed.primary) pf.xs.push(G.time)
}

export function Simulation() {
  const sendAcc = useRef({ pose: 0, world: 0, intent: 0 })

  useEffect(() => {
    const s = G.session!
    const offs: Array<() => void> = []
    clearBuffers()
    clearBigBuffer()
    resetBigLocals()
    offs.push(s.on('pose', (d: MiniPose) => receiveMiniPose(peerMini(), d)))
    offs.push(s.on('world', (d: WorldSnap) => { if (!s.isHost) receiveWorld(d) }))
    offs.push(s.on('ev', (m: { k: string; e: any }) => fx(m.k, m.e, false)))
    offs.push(s.on('hit', (m: any) => applyHit(localMini(), m)))
    offs.push(s.on('act', (m: { k: string; d: any }) => { if (s.isHost) G.actHandlers.get(m.k)?.(peerSlot(), m.d) }))
    offs.push(s.on('in', (d: any) => {
      remotePilot.move.set(d.m[0], 0, d.m[1])
      remotePilot.aim.set(d.a[0], d.a[1], d.a[2])
      remotePilot.brake = !!d.b
      remotePilot.couple = !!d.c
      remotePilot.grab = !!d.g
      remotePilot.reel = !!d.r
    }))
    offs.push(s.on('pj', (d: { t: number }) => remotePilot.jumps.push(Math.min(d.t, s.hostTime()))))
    offs.push(s.on('px', (d: { t: number }) => remotePilot.xs.push(Math.min(d.t, s.hostTime()))))
    offs.push(s.on('pause', (d: { on: boolean }) => { G.paused = d.on; useHud.setState({ paused: d.on }) }))

    // Generic host interactions: boxes and rescues.
    offs.push(onAct('grab', (slot, d) => {
      const nb = G.bodies.get(d.id)
      if (!nb) return
      if (nb.heldBy >= 0 && nb.heldBy !== slot) { if (slot !== localSlot()) s.send('deny', { id: d.id }); else localMini().carrying = null; return }
      nb.heldBy = slot
      nb.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true)
      setCarriedCollision(nb.body, true)
      // Shared carry medal: the box changed hands.
      const last = (nb as any).lastHolder
      if (last !== undefined && last !== slot) { G.stats.boxesShared++; G.medals.add('box') }
      ;(nb as any).lastHolder = slot
    }))
    offs.push(onAct('drop', (slot, d) => {
      const nb = G.bodies.get(d.id)
      if (!nb || nb.heldBy !== slot) return
      nb.heldBy = -1
      nb.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true)
      setCarriedCollision(nb.body, false)
      nb.body.setLinvel({ x: d.v[0], y: d.v[1], z: d.v[2] }, true)
      nb.body.setAngvel({ x: (Math.random() - 0.5) * 3, y: (Math.random() - 0.5) * 3, z: 0 }, true)
    }))
    offs.push(s.on('deny', (d: { id: string }) => { if (localMini().carrying === d.id) localMini().carrying = null }))
    offs.push(onAct('rescue', (_slot, d) => {
      G.stats.rescues[d.holder as 0 | 1]++
      if (G.stats.rescues[0] > 0 && G.stats.rescues[1] > 0 && !G.medals.has('rescue')) {
        G.medals.add('rescue')
        fx('medal', { id: 'rescue' })
      }
    }))

    // Form transitions are replicated as vars and applied identically on both sides.
    offs.push(onVar('form', (f: string) => applyForm(f as any)))
    return () => offs.forEach((o) => o())
  }, [])

  /* ---------------------------------------------------------------- render-rate */
  useFrame((_, dt) => {
    const f = pollHuman(dt)
    if (f.pressed.mute) toggleMute()
    setPushToTalk(f.held.talk)
    // Joined body: mouse / right stick aims this pilot's arm instead of the camera.
    if (G.form === 'joined') {
      if (f.device === 'pad') {
        aimOff.yaw = THREE.MathUtils.damp(aimOff.yaw, -f.aim.x * 1.1, 10, dt)
        aimOff.pitch = THREE.MathUtils.damp(aimOff.pitch, 0.35 + f.aim.y * 0.6, 10, dt)
      } else {
        aimOff.yaw = clamp(aimOff.yaw + f.look.x * 1.2, -1.2, 1.2)
        aimOff.pitch = clamp(aimOff.pitch + f.look.y * 1.2, -0.3, 1.2)
      }
      // Joined camera is guided; don't let the look delta orbit it.
      f.look.x = 0
      f.look.y = 0
    }
  }, -100)

  /* ---------------------------------------------------------------- fixed-rate */
  useBeforePhysicsStep((w) => {
    if (G.paused) return
    const world = w as unknown as World
    if (import.meta.env.DEV) (window as any).__world = world
    const dt = 1 / 60
    const s = G.session!
    // Advance per step (so sub-stepped frames keep their timing), gently
    // locked to the shared host clock.
    const ht = s.hostTime()
    G.time = Math.abs(ht - G.time) > 0.25 ? ht : G.time + dt + (ht - G.time - dt) * 0.05
    const me = localMini()
    const other = peerMini()

    consumeHuman(localIn)
    camRelative(localIn.stick, G.cam.yaw, localIn.move)
    aimFromCamera(localIn.aim)

    if (useHud.getState().levelDone) { localIn.move.set(0, 0, 0); clearEdges(localIn) }

    // Gloves are anchors for the partner's cable fist.
    for (const m of G.minis) {
      const a = G.anchors.get(`glove:${m.slot}`)
      if (a) { a.pos.copy(m.glove); a.enabled = m.offering && !m.hidden }
    }

    // Robots stop pushing each other while one hangs from the other's hand.
    for (const m of G.minis) {
      const o = G.minis[m.slot === 0 ? 1 : 0]
      const ghost = m.hangOn >= 0 || o.hangOn === m.slot || G.time < m.ghostT || G.time < o.ghostT
      if (m.body && ghostState.get(m) !== ghost && m.body.numColliders() > 0) {
        ghostState.set(m, ghost)
        m.body.collider(0).setSolverGroups(ghost ? GHOST_GROUPS : ROBOT_GROUPS)
      }
    }

    // Minis.
    if (!me.hidden) stepMini(world, me, localIn, dt, other)
    if (other.kind === 'ai') {
      aiDriver.mini?.(aiIn, dt)
      if (!other.hidden) stepMini(world, other, aiIn, dt, me)
      clearEdges(aiIn)
    } else if (other.kind === 'remote') {
      sampleMini(other)
      if (other.body && !other.hidden) other.body.setNextKinematicTranslation({ x: other.pos.x, y: other.pos.y, z: other.pos.z })
    }

    // Shared body.
    if (s.isHost) {
      const lp = pilots[localSlot()]
      const rp = pilots[peerSlot()]
      fillLocalPilot(lp, localIn)
      if (s.mode === 'solo') {
        rp.move.copy(lp.move); rp.aim.copy(lp.aim); rp.brake = false; rp.couple = lp.couple; rp.grab = lp.grab; rp.reel = lp.reel
        aiDriver.pilot?.(rp, lp, dt)
      } else {
        rp.move.copy(remotePilot.move); rp.aim.copy(remotePilot.aim); rp.brake = remotePilot.brake; rp.couple = remotePilot.couple
        rp.grab = remotePilot.grab; rp.reel = remotePilot.reel
        rp.jumps.push(...remotePilot.jumps); remotePilot.jumps.length = 0
        rp.xs.push(...remotePilot.xs); remotePilot.xs.length = 0
      }
      if (G.big.active) stepBig(world, G.big, pilots, dt)
      else { for (const p of pilots) { p.jumps.length = 0; p.xs.length = 0 } }
      hostForm(world, dt)
      hostCarry()
      for (const fn of G.hostLogic) fn(dt)
    } else {
      sampleBodies(localSlot(), (id) => (me.carrying === id ? carryPoint(me, tmp) : null))
      if (G.big.active) {
        sampleBig()
        G.big.body?.setNextKinematicTranslation({ x: G.big.pos.x, y: G.big.pos.y, z: G.big.pos.z })
      }
      if (G.form === 'joined') {
        // Instant local feedback; the host resolves the joint window fairly.
        if (localIn.pressed.jump) { s.send('pj', { t: G.time }); G.big.ready[localSlot()] = 1; sfx(localSlot() === 0 ? 'beepCyan' : 'beepAmber', G.big.pos, 0.6) }
        if (localIn.pressed.primary) s.send('px', { t: G.time })
      }
    }
    if (import.meta.env.DEV) (window as any).__onStep?.()
  })

  /* ---------------------------------------------------------------- network send */
  useFrame((_, dt) => {
    const s = G.session!
    if (s.mode !== 'online') return
    const acc = sendAcc.current
    acc.pose += dt
    acc.world += dt
    acc.intent += dt
    if (acc.pose >= 1 / NET.poseHz) {
      acc.pose = 0
      s.send('pose', encodeMini(localMini()))
    }
    if (s.isHost && acc.world >= 1 / NET.worldHz) {
      s.send('world', encodeWorld(acc.world))
      acc.world = 0
    }
    if (!s.isHost && G.form === 'joined') {
      // Send the moment intent changes (plus a heartbeat): no tick wait.
      const h = localIn
      const mv = camRelative(human.frame.move, G.cam.yaw, tmp2)
      const aim = pilotAim(tmp)
      const f = human.frame.held
      const msg = { m: [r2(mv.x), r2(mv.z)], a: [r2(aim.x), r2(aim.y), r2(aim.z)], b: f.brake ? 1 : 0, c: f.couple ? 1 : 0, g: f.grab ? 1 : 0, r: f.secondary ? 1 : 0 }
      const key = JSON.stringify(msg)
      if (key !== lastIntent || acc.intent >= 1 / NET.poseHz) {
        acc.intent = 0
        lastIntent = key
        s.send('in', msg)
      }
      void h
    }
  })

  return null
}

const r2 = (x: number) => Math.round(x * 100) / 100
let lastIntent = ''

/* ---------------------------------------------------------------- Forms */

let mergeStarts: [number, number] = [-9, -9]

function onPlate(m: Mini, p: Plate) {
  return !m.hidden && !m.dead && Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z) < p.radius && Math.abs(m.pos.y - MINI.feet - p.pos.y) < 1.2
}

function hostForm(world: World, dt: number) {
  const now = G.time
  const [a, b] = G.minis
  if (G.form === 'split') {
    let waiting = -1
    for (const p of plates.values()) {
      if (!p.enabled()) continue
      const ha = onPlate(a, p) && a.coupleHold > 0.05
      const hb = onPlate(b, p) && b.coupleHold > 0.05
      if (ha && mergeStarts[0] < 0) mergeStarts[0] = now
      if (!ha) mergeStarts[0] = -9
      if (hb && mergeStarts[1] < 0) mergeStarts[1] = now
      if (!hb) mergeStarts[1] = -9
      if (ha !== hb) waiting = ha ? 0 : 1
      // Consent: both hold Y for 0.6 s at the same time. A lone request just waits.
      if (ha && hb && a.coupleHold >= BIG.coupleHold && b.coupleHold >= BIG.coupleHold) {
        startMerge(p)
        waiting = -1
        break
      }
    }
    hostSet('coupleWait', waiting)
    return
  }
  if (G.form === 'merging') {
    if (now - G.formT >= BIG.mergeTime) finishMerge()
    return
  }
  if (G.form === 'joined') {
    const ct = bigWantsSplit(G.big, pilots, dt)
    const B = G.big
    const holding = ct[0] > 0.05 || ct[1] > 0.05
    hostSet('splitWait', holding ? (ct[0] > 0.05 && ct[1] > 0.05 ? 2 : ct[0] > 0.05 ? 0 : 1) : -1)
    if (ct[0] >= BIG.coupleHold && ct[1] >= BIG.coupleHold) {
      const ok = B.grounded && !B.carrying && B.arms.every((x) => x.cable.state === 'idle') && formRules.canSplit(B.pos)
      // Two free landing spots on the floor.
      const s = Math.sin(B.yaw), c = Math.cos(B.yaw)
      const spots = [new THREE.Vector3(B.pos.x + 1.3 * c, B.pos.y, B.pos.z - 1.3 * s), new THREE.Vector3(B.pos.x - 1.3 * c, B.pos.y, B.pos.z + 1.3 * s)]
      const floorOk = spots.every((sp) => {
        const r = world.castRay(new RAPIER.Ray({ x: sp.x, y: sp.y + 0.5, z: sp.z }, { x: 0, y: -1, z: 0 }), 3, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, B.body ?? undefined)
        return !!r && lineOfSight(world, B.pos, sp, B.body)
      })
      if (ok && floorOk) startSplit(spots)
      else if (!(G.vars.splitDenyT > now - 2)) {
        hostSet('splitDenyT', now)
        fx('hint', { text: 'Aquí no podéis separaros: buscad suelo ancho y soltad lo que llevéis.' })
      }
    }
    return
  }
  if (G.form === 'splitting' && now - G.formT >= 0.5) hostSet('form', 'split')
}

function startMerge(p: Plate) {
  const [a, b] = G.minis
  const mid = a.pos.clone().add(b.pos).multiplyScalar(0.5)
  mid.x = p.pos.x * 0.6 + mid.x * 0.4
  mid.z = p.pos.z * 0.6 + mid.z * 0.4
  mid.y = p.pos.y
  hostSet('formAt', [mid.x, mid.y, mid.z])
  hostSet('formYaw', p.yaw)
  hostSet('formT', G.time)
  hostSet('form', 'merging')
}

function finishMerge() {
  const B = G.big
  const at = G.vars.formAt as number[]
  B.active = true
  B.dead = false
  B.yaw = G.vars.formYaw
  B.pos.set(at[0], at[1] + BIG.feet + 0.05, at[2])
  B.vel.set(0, 0, 0)
  B.jumpPress = [-9, -9]
  for (const arm of B.arms) { arm.cable.state = 'idle'; arm.cable.anchorId = null; arm.grip = null }
  B.body?.setEnabled(true)
  B.body?.setTranslation({ x: B.pos.x, y: B.pos.y, z: B.pos.z }, true)
  B.body?.setLinvel({ x: 0, y: 3, z: 0 }, true)
  B.landT = G.time
  B.landImpact = 1
  hostSet('form', 'joined')
}

function startSplit(spots: THREE.Vector3[]) {
  hostSet('splA', [spots[0].x, spots[0].y, spots[0].z])
  hostSet('splB', [spots[1].x, spots[1].y, spots[1].z])
  hostSet('formAt', [G.big.pos.x, G.big.pos.y - BIG.feet, G.big.pos.z])
  hostSet('formYaw', G.big.yaw)
  hostSet('formT', G.time)
  hostSet('form', 'splitting')
}

/** Runs on both peers whenever the replicated form changes. */
function applyForm(f: 'split' | 'merging' | 'joined' | 'splitting') {
  const prev = G.form
  if (prev === f) return
  G.form = f
  G.formT = G.vars.formT ?? G.time
  const at = G.vars.formAt as number[] | undefined
  if (at) G.formAt.set(at[0], at[1], at[2])
  G.formYaw = G.vars.formYaw ?? 0
  useHud.setState({ form: f })
  const me = localMini()
  const other = peerMini()
  if (f === 'merging') {
    G.formFrom[0].copy(G.minis[0].pos)
    G.formFrom[1].copy(G.minis[1].pos)
    for (const m of [me, other]) {
      if (m.kind === 'remote') continue
      m.hidden = true
      m.cable.state = 'idle'
      m.cable.anchorId = null
      m.offering = false
      m.hangOn = -1
      m.coupleHold = 0
    }
    sfx('merge', G.formAt)
    stinger()
    fx('particles', { n: 'merge', p: { x: G.formAt.x, y: G.formAt.y + 1.5, z: G.formAt.z } }, false)
  }
  if (f === 'joined') {
    if (!isHost()) {
      // Guest: appear on the merge spot right away (snapshots refine it).
      const B = G.big
      B.active = true
      B.pos.set(G.formAt.x, G.formAt.y + BIG.feet + 0.05, G.formAt.z)
      B.yaw = G.formYaw
      B.body?.setEnabled(true)
      B.body?.setTranslation({ x: B.pos.x, y: B.pos.y, z: B.pos.z }, true)
    }
    fx('shake', { a: 0.4 }, false)
    toast('¡Cuerpo unido! Cada uno mueve su pierna y su brazo.', 'good')
  }
  if (f === 'splitting') {
    sfx('split', G.formAt)
    G.big.active = false
    G.big.body?.setEnabled(false)
    const spots = [G.vars.splA as number[], G.vars.splB as number[]]
    for (const m of [me, other]) {
      if (m.kind === 'remote') continue
      const sp = spots[m.slot]
      m.hidden = false
      respawnMini(m, new THREE.Vector3(sp[0], sp[1] + MINI.feet + 0.3, sp[2]), G.formYaw)
      const dir = new THREE.Vector3(sp[0] - G.formAt.x, 0, sp[2] - G.formAt.z).normalize()
      m.body?.setLinvel({ x: dir.x * 3, y: 7, z: dir.z * 3 }, true)
      m.protectT = 1
    }
    fx('particles', { n: 'merge', p: { x: G.formAt.x, y: G.formAt.y + 1.2, z: G.formAt.z } }, false)
  }
  if (f === 'split' && prev === 'joined') {
    // Forced split (e.g. scripted) without the splitting phase.
    G.big.active = false
  }
}

/** Host: carried boxes follow the hands of whoever carries them. */
function hostCarry() {
  for (const nb of G.bodies.values()) {
    if (nb.heldBy < 0) continue
    const m = G.minis[nb.heldBy]
    if ((m.carrying !== nb.id && m.kind !== 'remote') || m.hidden || m.dead) {
      nb.heldBy = -1
      nb.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true)
      setCarriedCollision(nb.body, false)
      continue
    }
    carryPoint(m, tmp)
    nb.body.setNextKinematicTranslation({ x: tmp.x, y: tmp.y, z: tmp.z })
    nb.body.setNextKinematicRotation({ x: 0, y: Math.sin(m.yaw / 2), z: 0, w: Math.cos(m.yaw / 2) })
  }
}

/** Carried crates stop colliding so they can't shove their carrier around. */
export function setCarriedCollision(body: import('@react-three/rapier').RapierRigidBody, carried: boolean) {
  for (let i = 0; i < body.numColliders(); i++) body.collider(i).setSensor(carried)
}

export function resetSimulationState() {
  plates.clear()
  aiDriver.mini = null
  aiDriver.pilot = null
  formRules.canSplit = () => true
  mergeStarts = [-9, -9]
  for (const p of pilots) { p.jumps.length = 0; p.xs.length = 0 }
  aimOff.yaw = 0
  aimOff.pitch = 0.35
}

export { act }
