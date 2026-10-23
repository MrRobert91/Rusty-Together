import { Quaternion, Vector3 } from 'three'
import type { RapierRigidBody } from '@react-three/rapier'
import type { Slot } from '../../shared/protocol'
import type { Session } from '../net/session'
import { emptyFrame, type InputFrame } from '../core/input'
import type { RobotView } from './robots/RobotModel'

export type V3T = [number, number, number]
export const v3 = (a: V3T | Vector3) => (Array.isArray(a) ? new Vector3(a[0], a[1], a[2]) : a.clone())
export const arr = (v: Vector3, p = 100): V3T => [Math.round(v.x * p) / p, Math.round(v.y * p) / p, Math.round(v.z * p) / p]

/* ------------------------------------------------------------ Anchors */

/** `button` and `enemy` are punch targets; the rest are hook / grip points. */
export type AnchorKind = 'ring' | 'glove' | 'latch' | 'bell' | 'handle' | 'robot' | 'button' | 'enemy'

export interface Anchor {
  id: string
  kind: AnchorKind
  pos: Vector3
  enabled: boolean
  mini: boolean // reachable by the mini hook (4 m) or punch
  big: boolean // reachable by the joined body telescopic arm (8 m)
  /** Slingshot pair: when both arms hang from the same group at full tension, releasing both hooks launches. */
  sling?: { group: string; to: Vector3; time: number }
  /** Arena bells belong to one player. */
  owner?: Slot
  /** Visual hint timestamps per slot (targeted this frame). */
  hot: [number, number]
}

/* ------------------------------------------------------------ Couple plates */

/** Plates where the minis can couple. Registered by levels. */
export interface Plate { id: string; pos: Vector3; radius: number; yaw: number; enabled: () => boolean }
export const plates = new Map<string, Plate>()

/** Standing on the plate (feet within reach of its surface). */
export function onPlate(m: { pos: Vector3; hidden: boolean; dead: boolean }, p: Plate) {
  return !m.hidden && !m.dead && Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z) < p.radius && Math.abs(m.pos.y - 0.5 - p.pos.y) < 1.2
}

/** The enabled plate this robot stands on, if any. */
export function plateUnder(m: { pos: Vector3; hidden: boolean; dead: boolean }) {
  for (const p of plates.values()) if (p.enabled() && onPlate(m, p)) return p
  return null
}

/* ------------------------------------------------------------ Robots */

export type CableState = 'idle' | 'flying' | 'attached' | 'retract'

export interface Cable {
  state: CableState
  tip: Vector3
  target: Vector3
  anchorId: string | null
  len: number
  t: number
  /** Whether the shot will hit something (otherwise whiff and return). */
  hit: boolean
  reeling: boolean
  charge: number
  /** A punch jab: flies out, hits whatever it reached and comes back (never latches). */
  punch: boolean
}

export const newCable = (): Cable => ({ state: 'idle', tip: new Vector3(), target: new Vector3(), anchorId: null, len: 0, t: 0, hit: false, reeling: false, charge: 0, punch: false })

export type MiniKind = 'local' | 'ai' | 'remote'

/** State of one mini robot: authoritative on its owner, a replica elsewhere. */
export class Mini {
  slot: Slot
  kind: MiniKind = 'remote'
  body: RapierRigidBody | null = null
  pos = new Vector3()
  vel = new Vector3()
  yaw = 0
  grounded = true
  offering = false
  /** Holding the partner's body with grab: they get dragged along. */
  towing = false
  /** Gripping a wall with grab (in the air). */
  cling = false
  clingT = 0
  clingN = new Vector3()
  /** Last punch (animation + cooldown). */
  punchT = -9
  /** When the partner last sprang off our head (squash). */
  stompT = -9
  glove = new Vector3()
  hangOn = -1 // slot whose glove we hang from
  hangT = 0
  hoist = 0 // 0..1 progress of hoisting the partner who hangs from us
  carrying: string | null = null
  cable: Cable = newCable()
  coupleHold = 0 // seconds the contextual button was held while standing on a couple plate
  wantSplit = 0
  emote = 0
  emoteT = 0
  ping: Vector3 | null = null
  pingT = 0
  hidden = false
  dead = false
  deadT = 0
  stunT = 0
  protectT = 0
  launchedT = 0
  landT = 0 // time of last landing (for squash anim)
  landImpact = 0
  jumpT = 0
  boosting = 0
  /** Until this time robot-robot contacts are off (climbing over a partner). */
  ghostT = 0
  input: InputFrame = emptyFrame()
  /** AI / remote intents mirrored for animation. */
  moveMag = 0
  talking = 0
  /** Render-side view (interpolated transform written by the model). */
  view: RobotView | null = null
  constructor(slot: Slot) { this.slot = slot }
}

export interface Arm {
  cable: Cable
  /** Handle id gripped with grab (hand IK target), or null. */
  grip: string | null
  aim: Vector3
  aimYaw: number
  aimPitch: number
}


/** The joined body. Simulated on the host; replicated to the guest. */
export class Combined {
  body: RapierRigidBody | null = null
  active = false
  pos = new Vector3()
  vel = new Vector3()
  yaw = 0
  grounded = true
  torsion = 0
  legs: [{ move: Vector3; anchored: boolean; push: number }, { move: Vector3; anchored: boolean; push: number }] = [
    { move: new Vector3(), anchored: false, push: 0 },
    { move: new Vector3(), anchored: false, push: 0 },
  ]
  arms: [Arm, Arm] = [
    { cable: newCable(), grip: null, aim: new Vector3(0, 0, -1), aimYaw: 0, aimPitch: 0 },
    { cable: newCable(), grip: null, aim: new Vector3(0, 0, -1), aimYaw: 0, aimPitch: 0 },
  ]
  /** Last jump press per pilot (host clock) for the joint jump window. */
  jumpPress: [number, number] = [-9, -9]
  xPress: [number, number] = [-9, -9]
  jumpKind: 'none' | 'hop' | 'joint' = 'none'
  jumpT = 0
  landT = 0
  landImpact = 0
  tension = 0 // 0..1 slingshot tension
  carrying: string | null = null
  launchedT = 0
  dead = false
  deadT = 0
  stunT = 0
  protectT = 0
  ready: [number, number] = [0, 0] // HUD: per-pilot readiness flash (jump)
  view: RobotView | null = null
}

/* ------------------------------------------------------------ World */

export type Form = 'split' | 'merging' | 'joined' | 'splitting'

export interface Checkpoint {
  id: string
  room: number
  spawns: [Vector3, Vector3]
  yaw: number
  joined?: { pos: Vector3; yaw: number }
}

export interface NetBody {
  id: string
  body: RapierRigidBody
  /** Guest only: interpolation buffer [t, x,y,z, qx,qy,qz,qw]. */
  buf: number[][]
  heldBy: number // slot carrying (-1 none)
  dynamic: boolean
}

export interface Camera {
  yaw: number
  pitch: number
  dist: number
  shake: number
  pos: Vector3
  target: Vector3
  fwd: Vector3
}

type FxHandler = (e: any) => void

/** The single mutable game state. Systems read and write it every step. */
export const G = {
  session: null as Session | null,
  level: 'tutorial' as string,
  minis: [new Mini(0), new Mini(1)] as [Mini, Mini],
  big: new Combined(),
  form: 'split' as Form,
  formT: 0,
  formFrom: [new Vector3(), new Vector3()] as [Vector3, Vector3],
  formAt: new Vector3(),
  formYaw: 0,
  anchors: new Map<string, Anchor>(),
  bodies: new Map<string, NetBody>(),
  vars: {} as Record<string, any>,
  dirty: new Set<string>(),
  checkpoint: null as Checkpoint | null,
  cam: { yaw: 0, pitch: 0.32, dist: 6.5, shake: 0, pos: new Vector3(), target: new Vector3(), fwd: new Vector3(0, 0, -1) } as Camera,
  time: 0, // seconds on the shared host clock (session.hostTime())
  paused: false,
  killY: -18,
  fx: new Map<string, Set<FxHandler>>(),
  stats: { falls: 0, rescues: [0, 0], jointJumps: 0, rings: 0, start: 0, bells: [0, 0], arenaWins: [0, 0], boxesShared: 0, ringChain: 0, bestChain: 0, parries: 0 },
  medals: new Set<string>(),
  hostLogic: [] as Array<(dt: number) => void>,
  actHandlers: new Map<string, (slot: Slot, d: any) => void>(),
  /** Host-side reactions to a punch landing on a `button` / `enemy` anchor, by anchor id. */
  punchHandlers: new Map<string, (slot: Slot) => void>(),
}

export const isHost = () => !!G.session?.isHost
export const localSlot = (): Slot => G.session?.localSlot ?? 0
export const peerSlot = (): Slot => (localSlot() === 0 ? 1 : 0)
export const localMini = () => G.minis[localSlot()]
export const peerMini = () => G.minis[peerSlot()]

export function resetRuntime(level: string, session: Session) {
  G.session = session
  G.level = level
  G.minis = [new Mini(0), new Mini(1)]
  G.big = new Combined()
  G.form = 'split'
  G.formT = 0
  G.anchors.clear()
  G.bodies.clear()
  G.vars = {}
  G.dirty.clear()
  G.checkpoint = null
  G.time = 0
  G.paused = false
  G.killY = -18
  G.stats = { falls: 0, rescues: [0, 0], jointJumps: 0, rings: 0, start: performance.now(), bells: [0, 0], arenaWins: [0, 0], boxesShared: 0, ringChain: 0, bestChain: 0, parries: 0 }
  G.medals = new Set()
  G.hostLogic = []
  G.actHandlers.clear()
  G.minis[session.localSlot].kind = 'local'
  G.minis[session.peerSlot].kind = session.mode === 'solo' ? 'ai' : 'remote'
}

/* ------------------------------------------------------------ Vars (host → guest) */

export function setVar(k: string, v: any) {
  if (G.vars[k] === v) return
  G.vars[k] = v
  G.dirty.add(k)
}
export const getVar = <T = any>(k: string, d?: T): T => (k in G.vars ? G.vars[k] : d) as T

/* ------------------------------------------------------------ FX events */

export function onFx(k: string, cb: FxHandler) {
  let s = G.fx.get(k)
  if (!s) G.fx.set(k, (s = new Set()))
  s.add(cb)
  return () => { s!.delete(cb) }
}

/** Run an effect locally and (optionally) mirror it on the peer. */
export function fx(k: string, e: Record<string, any> = {}, mirror = true) {
  G.fx.get(k)?.forEach((cb) => cb(e))
  if (mirror && G.session?.mode === 'online') G.session.send('ev', { k, e })
}

/** Guest → host interaction request (applied directly when we are the host). */
export function act(k: string, d: Record<string, any> = {}) {
  const s = localSlot()
  if (isHost()) G.actHandlers.get(k)?.(s, d)
  else G.session?.send('act', { k, d })
}

export function onAct(k: string, cb: (slot: Slot, d: any) => void) {
  G.actHandlers.set(k, cb)
  return () => { G.actHandlers.delete(k) }
}

/* ------------------------------------------------------------ Anchors */

export function addAnchor(a: Omit<Anchor, 'hot' | 'enabled' | 'mini' | 'big'> & Partial<Pick<Anchor, 'enabled' | 'mini' | 'big'>>) {
  const full: Anchor = { enabled: true, mini: true, big: true, hot: [0, 0], ...a }
  G.anchors.set(a.id, full)
  return full
}

/* ------------------------------------------------------------ Helpers */

export const tmpV = () => new Vector3()
export const tmpQ = () => new Quaternion()
export const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x)
export const damp = (a: number, b: number, lambda: number, dt: number) => a + (b - a) * (1 - Math.exp(-lambda * dt))
export const wrapAngle = (a: number) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a }
export const dampAngle = (a: number, b: number, lambda: number, dt: number) => a + wrapAngle(b - a) * (1 - Math.exp(-lambda * dt))

export function ballistic(from: Vector3, to: Vector3, time: number, g: number) {
  return new Vector3((to.x - from.x) / time, (to.y - from.y) / time + 0.5 * g * time, (to.z - from.z) / time)
}

/** Camera-relative 2D stick → world XZ direction. */
export function camRelative(move: { x: number; y: number }, yaw: number, out = new Vector3()) {
  const s = Math.sin(yaw)
  const c = Math.cos(yaw)
  // forward = (-sin, -cos) ; right = (cos, -sin)
  out.set(move.x * c - move.y * s, 0, -move.x * s - move.y * c)
  return out
}

if (import.meta.env.DEV && typeof window !== 'undefined') (window as any).__G = G
