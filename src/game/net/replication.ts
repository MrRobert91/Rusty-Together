import { Quaternion, Vector3 } from 'three'
import { G, arr, isHost, type Mini, type CableState } from '../runtime'
import { NET } from '../tuning'
import type { Slot } from '../../../shared/protocol'

/* ------------------------------------------------------------ Mini poses */

const CABLE: CableState[] = ['idle', 'flying', 'attached', 'retract']

export interface MiniPose {
  t: number
  p: number[]
  v: number[]
  y: number
  f: number // flags
  gl: number[]
  c: number
  tp: number[]
  a: string
  h: number
  ho: number
  cr: string
  ch: number
  cg: number
  e: number
  et: number
  pg: number[] | null
  pt: number
  lt: number
  li: number
  jt: number
}

export function encodeMini(m: Mini): MiniPose {
  const f =
    (m.grounded ? 1 : 0) | (m.crouch ? 2 : 0) | (m.offering ? 4 : 0) | (m.hidden ? 8 : 0) | (m.dead ? 16 : 0) |
    (m.cable.reeling ? 32 : 0) | (m.stunT > 0 ? 64 : 0) | (m.boosting > 0 ? 128 : 0) | (G.time < m.ghostT ? 256 : 0)
  // G.time runs on the shared host clock, so timestamps travel as-is.
  const rel = (x: number) => Math.round(x * 1000) / 1000
  return {
    t: G.session!.hostTime(),
    p: arr(m.pos, 1000),
    v: arr(m.vel, 100),
    y: Math.round(m.yaw * 1000) / 1000,
    f,
    gl: arr(m.glove, 100),
    c: CABLE.indexOf(m.cable.state),
    tp: arr(m.cable.tip, 100),
    a: m.cable.anchorId ?? '',
    h: m.hangOn,
    ho: Math.round(m.hoist * 100) / 100,
    cr: m.carrying ?? '',
    ch: Math.round(m.coupleHold * 100) / 100,
    cg: Math.round(m.cable.charge * 100) / 100,
    e: m.emote,
    et: rel(m.emoteT),
    pg: m.ping ? arr(m.ping, 10) : null,
    pt: rel(m.pingT),
    lt: rel(m.landT),
    li: Math.round(m.landImpact * 100) / 100,
    jt: rel(m.jumpT),
  }
}

interface Sample { t: number; p: Vector3; v: Vector3; y: number }
const buffers: Record<number, Sample[]> = { 0: [], 1: [] }

export function receiveMiniPose(m: Mini, d: MiniPose) {
  const buf = buffers[m.slot]
  buf.push({ t: d.t, p: new Vector3(d.p[0], d.p[1], d.p[2]), v: new Vector3(d.v[0], d.v[1], d.v[2]), y: d.y })
  while (buf.length > 30) buf.shift()
  const f = d.f
  m.grounded = !!(f & 1)
  m.crouch = !!(f & 2)
  m.offering = !!(f & 4)
  m.hidden = !!(f & 8)
  m.dead = !!(f & 16)
  m.cable.reeling = !!(f & 32)
  m.stunT = f & 64 ? 0.2 : 0
  m.boosting = f & 128 ? 0.2 : 0
  m.ghostT = f & 256 ? G.time + 0.15 : 0
  m.glove.set(d.gl[0], d.gl[1], d.gl[2])
  m.cable.state = CABLE[d.c] ?? 'idle'
  m.cable.tip.set(d.tp[0], d.tp[1], d.tp[2])
  m.cable.anchorId = d.a || null
  m.cable.charge = d.cg
  m.hangOn = d.h
  m.hoist = d.ho
  m.carrying = d.cr || null
  m.coupleHold = d.ch
  const abs = (r: number) => r
  if (d.e !== m.emote || Math.abs(abs(d.et) - m.emoteT) > 0.3) { m.emote = d.e; m.emoteT = abs(d.et) }
  m.ping = d.pg ? new Vector3(d.pg[0], d.pg[1], d.pg[2]) : null
  m.pingT = abs(d.pt)
  const lt = abs(d.lt)
  if (Math.abs(lt - m.landT) > 0.05) { m.landT = lt; m.landImpact = d.li }
  m.jumpT = abs(d.jt)
}

/** Interpolate a remote mini at (host time - delay). */
export function sampleMini(m: Mini) {
  const buf = buffers[m.slot]
  if (!buf.length) return
  const rt = G.session!.hostTime() - NET.interpDelay
  let i = buf.length - 1
  while (i > 0 && buf[i - 1].t > rt) i--
  const b = buf[i]
  const a = buf[Math.max(0, i - 1)]
  if (rt >= b.t || a === b) {
    // Extrapolate briefly (≤ 100 ms) to hide jitter.
    const ex = Math.min(Math.max(rt - b.t, 0), 0.1)
    m.pos.copy(b.p).addScaledVector(b.v, ex)
    m.vel.copy(b.v)
    m.yaw = b.y
    return
  }
  const k = (rt - a.t) / Math.max(1e-4, b.t - a.t)
  m.pos.lerpVectors(a.p, b.p, Math.max(0, Math.min(1, k)))
  m.vel.lerpVectors(a.v, b.v, k)
  let dy = b.y - a.y
  while (dy > Math.PI) dy -= Math.PI * 2
  while (dy < -Math.PI) dy += Math.PI * 2
  m.yaw = a.y + dy * k
}

export function clearBuffers() { buffers[0] = []; buffers[1] = [] }

/* ------------------------------------------------------------ World snapshot (host → guest) */

export interface WorldSnap {
  t: number
  b: (string | number)[][]
  v: Record<string, any>
  big?: any
  full?: boolean
}

let fullTimer = 0

export function encodeWorld(dt: number): WorldSnap {
  const now = G.session!.hostTime()
  const bodies: (string | number)[][] = []
  for (const nb of G.bodies.values()) {
    const p = nb.body.translation()
    const q = nb.body.rotation()
    bodies.push([nb.id, r3(p.x), r3(p.y), r3(p.z), r3(q.x), r3(q.y), r3(q.z), r3(q.w), nb.heldBy])
  }
  fullTimer += dt
  const full = fullTimer > 1
  if (full) fullTimer = 0
  const vars: Record<string, any> = {}
  if (full) Object.assign(vars, G.vars)
  else for (const k of G.dirty) vars[k] = G.vars[k]
  G.dirty.clear()
  const snap: WorldSnap = { t: now, b: bodies, v: vars, full }
  if (G.big.active || G.form !== 'split') snap.big = encodeBig()
  return snap
}

const r3 = (x: number) => Math.round(x * 1000) / 1000

function encodeBig() {
  const B = G.big
  return {
    a: B.active ? 1 : 0,
    p: arr(B.pos, 1000), v: arr(B.vel, 100), y: r3(B.yaw), g: B.grounded ? 1 : 0, to: r3(B.torsion),
    lg: [arr(B.legs[0].move, 100), arr(B.legs[1].move, 100), B.legs[0].anchored ? 1 : 0, B.legs[1].anchored ? 1 : 0],
    ar: B.arms.map((a) => [CABLE.indexOf(a.cable.state), arr(a.cable.tip, 100), a.cable.anchorId ?? '', a.grip ?? '', a.cable.reeling ? 1 : 0]),
    jk: B.jumpKind, jt: r3(B.jumpT), lt: r3(B.landT), li: r3(B.landImpact), te: r3(B.tension), rd: [r3(B.ready[0]), r3(B.ready[1])],
    cr: B.carrying ?? '', d: B.dead ? 1 : 0,
  }
}

const bigBuf: { t: number; p: Vector3; v: Vector3; y: number }[] = []

export function receiveWorld(s: WorldSnap) {
  // Vars first: gameplay state for props, HUD and level scripts.
  for (const [k, val] of Object.entries(s.v)) {
    if (G.vars[k] !== val) { G.vars[k] = val; varListeners.get(k)?.forEach((cb) => cb(val)) }
  }
  for (const row of s.b) {
    const nb = G.bodies.get(row[0] as string)
    if (!nb) continue
    nb.buf.push([s.t, row[1] as number, row[2] as number, row[3] as number, row[4] as number, row[5] as number, row[6] as number, row[7] as number])
    if (nb.buf.length > 20) nb.buf.shift()
    const held = row[8] as number
    if ((held >= 0) !== (nb.heldBy >= 0)) for (let i = 0; i < nb.body.numColliders(); i++) nb.body.collider(i).setSensor(held >= 0)
    nb.heldBy = held
  }
  if (s.big) {
    const d = s.big
    const B = G.big
    if (d.a && !B.active && B.body) {
      // First snapshot of an active body: place it, don't let it fly in.
      bigBuf.length = 0
      B.body.setTranslation({ x: d.p[0], y: d.p[1], z: d.p[2] }, true)
      B.pos.set(d.p[0], d.p[1], d.p[2])
    }
    B.active = !!d.a
    bigBuf.push({ t: s.t, p: new Vector3(d.p[0], d.p[1], d.p[2]), v: new Vector3(d.v[0], d.v[1], d.v[2]), y: d.y })
    while (bigBuf.length > 20) bigBuf.shift()
    B.grounded = !!d.g
    B.torsion = d.to
    B.legs[0].move.set(d.lg[0][0], d.lg[0][1], d.lg[0][2])
    B.legs[1].move.set(d.lg[1][0], d.lg[1][1], d.lg[1][2])
    B.legs[0].anchored = !!d.lg[2]
    B.legs[1].anchored = !!d.lg[3]
    B.legs[0].push = B.legs[0].move.length()
    B.legs[1].push = B.legs[1].move.length()
    d.ar.forEach((a: any, i: number) => {
      const arm = B.arms[i]
      arm.cable.state = CABLE[a[0]] ?? 'idle'
      arm.cable.tip.set(a[1][0], a[1][1], a[1][2])
      arm.cable.anchorId = a[2] || null
      arm.grip = a[3] || null
      arm.cable.reeling = !!a[4]
    })
    const toLocal = (ht: number) => ht
    B.jumpKind = d.jk
    B.jumpT = toLocal(d.jt)
    const lt = toLocal(d.lt)
    if (Math.abs(lt - B.landT) > 0.05) { B.landT = lt; B.landImpact = d.li }
    B.tension = d.te
    B.ready = d.rd
    B.carrying = d.cr || null
    B.dead = !!d.d
  }
}

const tq = new Quaternion()
const tq2 = new Quaternion()

/** Guest: drive kinematic proxies of host-simulated bodies. */
export function sampleBodies(localSlot: Slot, carryTarget: (id: string) => Vector3 | null) {
  const rt = G.session!.hostTime() - NET.interpDelay
  for (const nb of G.bodies.values()) {
    const own = carryTarget(nb.id)
    if (own) {
      nb.body.setNextKinematicTranslation({ x: own.x, y: own.y, z: own.z })
      continue
    }
    const buf = nb.buf
    if (!buf.length) continue
    let i = buf.length - 1
    while (i > 0 && buf[i - 1][0] > rt) i--
    const b = buf[i]
    const a = buf[Math.max(0, i - 1)]
    const k = a === b ? 1 : Math.max(0, Math.min(1, (rt - a[0]) / Math.max(1e-4, b[0] - a[0])))
    nb.body.setNextKinematicTranslation({ x: a[1] + (b[1] - a[1]) * k, y: a[2] + (b[2] - a[2]) * k, z: a[3] + (b[3] - a[3]) * k })
    tq.set(a[4], a[5], a[6], a[7])
    tq2.set(b[4], b[5], b[6], b[7])
    tq.slerp(tq2, k)
    nb.body.setNextKinematicRotation({ x: tq.x, y: tq.y, z: tq.z, w: tq.w })
  }
  void localSlot
}

export function sampleBig() {
  if (!bigBuf.length) return
  const B = G.big
  const rt = G.session!.hostTime() - NET.interpDelay
  let i = bigBuf.length - 1
  while (i > 0 && bigBuf[i - 1].t > rt) i--
  const b = bigBuf[i]
  const a = bigBuf[Math.max(0, i - 1)]
  if (a === b || rt >= b.t) {
    const ex = Math.min(Math.max(rt - b.t, 0), 0.1)
    B.pos.copy(b.p).addScaledVector(b.v, ex)
    B.vel.copy(b.v)
    B.yaw = b.y
    return
  }
  const k = Math.max(0, Math.min(1, (rt - a.t) / Math.max(1e-4, b.t - a.t)))
  B.pos.lerpVectors(a.p, b.p, k)
  B.vel.lerpVectors(a.v, b.v, k)
  let dy = b.y - a.y
  while (dy > Math.PI) dy -= Math.PI * 2
  while (dy < -Math.PI) dy += Math.PI * 2
  B.yaw = a.y + dy * k
}

export function clearBigBuffer() { bigBuf.length = 0 }

/* ------------------------------------------------------------ Var listeners (both sides) */

const varListeners = new Map<string, Set<(v: any) => void>>()
export function onVar(k: string, cb: (v: any) => void) {
  let s = varListeners.get(k)
  if (!s) varListeners.set(k, (s = new Set()))
  s.add(cb)
  return () => { s!.delete(cb) }
}

/** Host-side set that also notifies local listeners. */
export function hostSet(k: string, v: any) {
  if (!isHost()) return
  if (G.vars[k] === v) return
  G.vars[k] = v
  G.dirty.add(k)
  varListeners.get(k)?.forEach((cb) => cb(v))
}

export function resetVarListeners() { varListeners.clear() }
