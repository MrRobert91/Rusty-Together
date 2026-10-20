import { ArriveBehavior, EntityManager, State, StateMachine, Vehicle, Vector3 as YV3 } from 'yuka'
import * as THREE from 'three'
import { G, ballistic, fx, type Mini } from '../runtime'
import type { StepInput } from '../control'
import type { PilotFrame } from '../robots/bigController'
import { GRAVITY, MINI } from '../tuning'
import { respawnMini } from '../robots/miniController'

/**
 * Ámbar-bot: the solo-tutorial partner. Navigation uses a Yuka Vehicle with an
 * Arrive behaviour (its steering output becomes a virtual stick), and a Yuka
 * StateMachine sequences what the tutorial needs from a partner. The bot
 * drives the same controller a human does, so everything it does is legal.
 */

export type AiMode =
  | { k: 'sleep' }
  | { k: 'follow' }
  | { k: 'goto'; to: THREE.Vector3; face?: number }
  | { k: 'crouch'; at: THREE.Vector3 }
  | { k: 'grabUp'; under: THREE.Vector3 }
  | { k: 'offer'; at: THREE.Vector3; face: number }
  | { k: 'couple'; at: THREE.Vector3 }
  | { k: 'cross'; from: THREE.Vector3; ring: string; to: THREE.Vector3; then: AiMode }

export interface PilotMode { jump: 'none' | 'sync'; arms: 'none' | 'sync' }

class Brain {
  vehicle = new Vehicle()
  arrive = new ArriveBehavior(new YV3(), 0.4, 0.2)
  em = new EntityManager()
  fsm: StateMachine<Brain>
  mode: AiMode = { k: 'sleep' }
  inp!: StepInput
  me!: Mini
  you!: Mini
  t = 0
  stateT = 0
  arrived = false
  jumpCd = 0
  pilot: PilotMode = { jump: 'none', arms: 'none' }
  queued: Array<{ at: number; kind: 'jump' | 'x' | 'xr' }> = []
  stuckT = 0
  lastPos = new THREE.Vector3()
  force = new YV3()

  constructor() {
    this.vehicle.maxSpeed = 4.6
    this.vehicle.maxForce = 1000
    this.vehicle.mass = 1
    this.vehicle.steering.add(this.arrive)
    this.em.add(this.vehicle)
    this.fsm = new StateMachine<Brain>(this)
    this.fsm.add('sleep', new SleepState())
    this.fsm.add('move', new MoveState())
    this.fsm.add('crouch', new CrouchState())
    this.fsm.add('grabUp', new GrabUpState())
    this.fsm.add('offer', new OfferState())
    this.fsm.add('couple', new CoupleState())
    this.fsm.add('cross', new CrossState())
    this.fsm.changeTo('sleep')
  }

  setMode(m: AiMode) {
    this.mode = m
    this.stateT = 0
    this.arrived = false
    const id = m.k === 'follow' || m.k === 'goto' ? 'move' : m.k
    this.fsm.changeTo(id)
  }

  /** Steer toward a point; returns true when arrived. */
  steer(to: THREE.Vector3, tolerance = 0.35, speed = 4.6) {
    const dx = to.x - this.me.pos.x
    const dz = to.z - this.me.pos.z
    const d = Math.hypot(dx, dz)
    if (d < tolerance) { this.inp.move.set(0, 0, 0); return true }
    // With zero current velocity, Arrive's steering force *is* the desired
    // velocity (slowing near the target); it becomes a virtual stick.
    this.vehicle.maxSpeed = speed
    this.vehicle.position.set(this.me.pos.x, 0, this.me.pos.z)
    this.vehicle.velocity.set(0, 0, 0)
    this.arrive.target.set(to.x, 0, to.z)
    this.vehicle.steering.calculate(1 / 60, this.force)
    const v = this.force
    const len = Math.hypot(v.x, v.z)
    const k = Math.min(1, len / 4.6)
    if (len > 1e-3) this.inp.move.set((v.x / len) * k, 0, (v.z / len) * k)
    else this.inp.move.set(dx / d, 0, dz / d)
    // Hop small ledges / gaps in the way.
    if (this.me.grounded && this.jumpCd <= 0) {
      const up = to.y - (this.me.pos.y - MINI.feet)
      if ((up > 0.35 && up < 1.1 && d < 2.6) || this.stuckT > 0.6) { this.inp.pressed.jump = true; this.inp.held.jump = true; this.jumpCd = 0.6; this.stuckT = 0 }
    }
    return false
  }

  face(yaw: number) {
    // A tiny nudge makes the controller turn without walking away.
    this.inp.move.set(Math.sin(yaw) * 0.05, 0, Math.cos(yaw) * 0.05)
  }
}

class SleepState extends State<Brain> {
  execute(b: Brain) { b.inp.move.set(0, 0, 0) }
}

class MoveState extends State<Brain> {
  execute(b: Brain) {
    const m = b.mode
    if (m.k === 'follow') {
      // Stay ~2 m behind-beside the player; never crowd their landing spot.
      const tgt = b.you.pos.clone()
      const off = new THREE.Vector3(b.me.pos.x - b.you.pos.x, 0, b.me.pos.z - b.you.pos.z)
      if (off.lengthSq() < 0.01) off.set(1, 0, 0)
      off.setLength(2.2)
      tgt.add(off)
      tgt.y = b.you.pos.y - MINI.feet
      if (b.me.pos.distanceTo(b.you.pos) > 2.8) b.steer(tgt, 0.5)
      else b.inp.move.set(0, 0, 0)
      // Never get left behind: catch up if far or below.
      if (b.you.grounded && (b.me.pos.distanceTo(b.you.pos) > 16 || b.me.pos.y < b.you.pos.y - 3) && b.stateT > 1) {
        respawnMini(b.me, b.you.pos.clone().add(off).setY(b.you.pos.y + 0.5), b.you.yaw)
        b.stateT = 0
      }
    } else if (m.k === 'goto') {
      b.arrived = b.steer(m.to, 0.4)
      if (b.arrived && m.face !== undefined) b.face(m.face)
    }
  }
}

class CrouchState extends State<Brain> {
  execute(b: Brain) {
    const m = b.mode as Extract<AiMode, { k: 'crouch' }>
    if (b.steer(m.at, 0.3)) {
      b.arrived = true
      b.inp.held.brake = true
    }
  }
}

class GrabUpState extends State<Brain> {
  wasHanging = false
  climbed = false
  safe = new THREE.Vector3()
  enter() { this.wasHanging = false; this.climbed = false }
  execute(b: Brain) {
    const m = b.mode as Extract<AiMode, { k: 'grabUp' }>
    if (b.me.hangOn >= 0) { this.wasHanging = true; b.inp.held.grab = true; b.inp.move.set(0, 0, 0); return }
    if (this.wasHanging && !this.climbed) {
      this.climbed = true
      // Step away from the ledge, behind the partner who pulled us up.
      const away = new THREE.Vector3(b.you.pos.x - b.you.glove.x, 0, b.you.pos.z - b.you.glove.z).normalize()
      this.safe.copy(b.you.pos).addScaledVector(away, 1.8).add(new THREE.Vector3(away.z, 0, -away.x).multiplyScalar(1.2))
    }
    if (this.climbed) { if (b.me.grounded) b.steer(this.safe, 0.4); else b.inp.move.set(0, 0, 0); return }
    if (!b.you.offering) { b.steer(m.under, 0.4); return }
    const g = b.you.glove
    const under = new THREE.Vector3(g.x, m.under.y, g.z)
    // Stand just below the offered hand, then jump and grab at the apex.
    if (b.steer(under, 0.45) && b.me.grounded && b.jumpCd <= 0) {
      b.inp.pressed.jump = true
      b.inp.held.jump = true
      b.jumpCd = 1.2
    }
    if (!b.me.grounded) {
      b.inp.held.jump = true
      const near = b.me.pos.clone().setY(b.me.pos.y + 0.5).distanceTo(g) < MINI.gloveRange - 0.1
      if (near) { b.inp.pressed.grab = true; b.inp.held.grab = true }
    }
  }
}

class OfferState extends State<Brain> {
  execute(b: Brain) {
    const m = b.mode as Extract<AiMode, { k: 'offer' }>
    if (!b.arrived) {
      if (b.steer(m.at, 0.3)) b.arrived = true
      return
    }
    b.me.yaw = m.face
    b.inp.move.set(0, 0, 0)
    b.inp.held.grab = true
  }
}

class CoupleState extends State<Brain> {
  execute(b: Brain) {
    const m = b.mode as Extract<AiMode, { k: 'couple' }>
    const p = m.at.clone().add(new THREE.Vector3(-1.1, 0, 0))
    // Hysteresis: once on the plate, stay put instead of re-steering.
    if (b.arrived && Math.hypot(b.me.pos.x - p.x, b.me.pos.z - p.z) > 1.4) b.arrived = false
    if (b.arrived || b.steer(p, 0.5)) {
      b.arrived = true
      b.inp.move.set(0, 0, 0)
      // Mirror the player: hold Y only while they hold it on the plate.
      const youOn = Math.hypot(b.you.pos.x - m.at.x, b.you.pos.z - m.at.z) < 2.4
      b.inp.held.couple = youOn && b.you.coupleHold > 0.05
    }
  }
}

/** Scripted ring crossing used to get the bot to the far side first. */
class CrossState extends State<Brain> {
  launched = false
  enter() { this.launched = false }
  execute(b: Brain) {
    const m = b.mode as Extract<AiMode, { k: 'cross' }>
    if (!this.launched) {
      if (b.steer(m.from, 0.35) && b.me.grounded) {
        this.launched = true
        b.stateT = 0
        const ring = G.anchors.get(m.ring)
        const c = b.me.cable
        if (ring && b.me.body) {
          // Visual cable (slack) + a reliable ballistic arc to the far side.
          c.state = 'attached'
          c.anchorId = ring.id
          c.tip.copy(ring.pos)
          c.target.copy(ring.pos)
          c.len = 50
          fx('sfx', { n: 'cableFire', p: b.me.pos })
          fx('sfx', { n: 'cableHit', p: ring.pos })
          const v = ballistic(b.me.pos, m.to.clone().setY(m.to.y + MINI.feet), 1.1, GRAVITY)
          b.me.body.setLinvel({ x: v.x, y: v.y, z: v.z }, true)
          b.me.launchedT = 1.1
          b.me.jumpT = G.time
        }
      }
      return
    }
    b.inp.move.set(0, 0, 0)
    if (b.stateT > 0.75 && b.me.cable.state === 'attached') { b.me.cable.state = 'retract'; b.me.cable.anchorId = null }
    if (b.stateT > 1.3 && b.me.grounded) b.setMode(m.then)
  }
}

export const brain = new Brain()

export function companionMini(inp: StepInput, dt: number) {
  const b = brain
  b.inp = inp
  b.me = G.minis[1]
  b.you = G.minis[0]
  b.t += dt
  b.stateT += dt
  b.jumpCd = Math.max(0, b.jumpCd - dt)
  inp.move.set(0, 0, 0)
  inp.held.jump = false
  inp.held.grab = false
  inp.held.brake = false
  inp.held.couple = false
  inp.aim.set(Math.sin(b.me.yaw), 0.3, Math.cos(b.me.yaw)).normalize()
  // Stuck detection (pushing into a wall).
  const moved = b.me.pos.distanceTo(b.lastPos)
  b.stuckT = inp.move.lengthSq() > 0.1 && moved < 0.01 ? b.stuckT + dt : 0
  b.lastPos.copy(b.me.pos)
  b.fsm.update()
}

/** In the joined body the bot mirrors your leg and can sync jumps / arms. */
export function companionPilot(rp: PilotFrame, lp: PilotFrame) {
  const b = brain
  const now = G.time
  rp.move.copy(lp.move)
  rp.aim.copy(lp.aim)
  rp.reel = b.pilot.arms === 'sync' ? lp.reel : false
  rp.grab = lp.grab
  if (b.pilot.jump === 'sync') for (const _ of lp.jumps) b.queued.push({ at: now + 0.11, kind: 'jump' })
  if (b.pilot.arms === 'sync') for (const _ of lp.xs) b.queued.push({ at: now + 0.12, kind: 'x' })
  if (b.pilot.arms === 'sync') for (const _ of lp.xr) b.queued.push({ at: now + 0.12, kind: 'xr' })
  b.queued = b.queued.filter((q) => {
    if (q.at > now) return true
    if (q.kind === 'jump') rp.jumps.push(q.at)
    else if (q.kind === 'xr') rp.xr.push(q.at)
    else rp.xs.push(q.at)
    fx('sfx', { n: 'beepAmber', p: G.big.pos, v: 0.5 })
    return false
  })
}

export function resetBrain() {
  brain.setMode({ k: 'sleep' })
  brain.pilot = { jump: 'none', arms: 'none' }
  brain.queued = []
}
