import { Vector3 } from 'three'
import type { World } from '@dimforge/rapier3d-compat'
import { G, ballistic, clamp, dampAngle, fx, type Combined, type Anchor } from '../runtime'
import { BIG, GRAVITY } from '../tuning'
import { lineOfSight, newGroundHit, probeGround } from './physicsUtil'
import { settings } from '../../core/settings'
import { toast } from '../hud'

/** One pilot's contribution to the shared body during a physics step. */
export interface PilotFrame {
  move: Vector3 // world XZ, |m| ≤ 1
  aim: Vector3 // world aim direction for this pilot's arm
  brake: boolean
  couple: boolean
  grab: boolean
  reel: boolean
  /** Host-clock timestamps of presses that happened since the last step. */
  jumps: number[]
  xs: number[]
  emote: number
}

export const newPilotFrame = (): PilotFrame => ({ move: new Vector3(), aim: new Vector3(0, 0, -1), brake: false, couple: false, grab: false, reel: false, jumps: [], xs: [], emote: 0 })

const gh = newGroundHit()
const v = new Vector3()
const gv = new Vector3()
const rel = new Vector3()
const target = new Vector3()
const tmp = new Vector3()
const tmp2 = new Vector3()
const avg = new Vector3()
const right = new Vector3()

interface BigLocal { lastGround: number; prevVy: number; hopOwner: number; slingNag: number; coupleT: [number, number] }
const bl: BigLocal = { lastGround: 0, prevVy: 0, hopOwner: -1, slingNag: 0, coupleT: [0, 0] }

export const window_ = (base: number) => (settings().assist ? Math.max(base, BIG.assistWindow) : base)

/** Shoulder position of a side (0 = left/Cian, 1 = right/Ámbar) in world space. */
export function shoulderPos(B: Combined, side: number, out: Vector3) {
  const s = Math.sin(B.yaw)
  const c = Math.cos(B.yaw)
  const lx = side === 0 ? 0.62 : -0.62
  return out.set(B.pos.x + lx * c, B.pos.y + 0.55, B.pos.z - lx * s)
}

export function pickBigTarget(world: World, B: Combined, side: number, aim: Vector3): Anchor | null {
  shoulderPos(B, side, tmp2)
  right.set(-Math.cos(B.yaw), 0, Math.sin(B.yaw)) // robot's right (-X local)
  let best: Anchor | null = null
  let bestScore = Infinity
  const range = BIG.armRange + (settings().assist ? 1 : 0)
  for (const a of G.anchors.values()) {
    if (!a.enabled || !a.big || a.kind === 'handle' || a.kind === 'glove' || a.kind === 'bell') continue
    // The other arm already holds it.
    const other = B.arms[side === 0 ? 1 : 0].cable
    if (other.anchorId === a.id && other.state !== 'idle') continue
    tmp.copy(a.pos).sub(tmp2)
    const d = tmp.length()
    if (d > range || d < 0.5) continue
    tmp.divideScalar(d)
    const dot = tmp.dot(aim)
    if (dot < 0.1) continue
    // Prefer anchors on this pilot's side of the body.
    const sideDot = tmp.dot(right) * (side === 0 ? -1 : 1)
    const score = d * 0.35 + (1 - dot) * 7 - sideDot * 1.6 - (a.sling ? 0.5 : 0)
    if (score < bestScore && lineOfSight(world, tmp2, a.pos, B.body, 0.5)) { bestScore = score; best = a }
  }
  return best
}

export function stepBig(world: World, B: Combined, P: [PilotFrame, PilotFrame], dt: number) {
  const b = B.body
  if (!b || !B.active) return
  const t = G.session!.hostTime()
  const p = b.translation()
  const lv = b.linvel()
  B.pos.set(p.x, p.y, p.z)
  v.set(lv.x, lv.y, lv.z)

  if (B.dead) {
    b.setLinvel({ x: 0, y: 0, z: 0 }, true)
    if (t - B.deadT > 1.2 && G.checkpoint?.joined) {
      const j = G.checkpoint.joined
      b.setTranslation({ x: j.pos.x, y: j.pos.y + BIG.feet + 0.1, z: j.pos.z }, true)
      B.yaw = j.yaw
      B.dead = false
      B.protectT = 1.5
      for (const arm of B.arms) { arm.cable.state = 'idle'; arm.cable.anchorId = null; arm.grip = null }
      fx('particles', { n: 'poof', p: j.pos, s: 2 })
      fx('sfx', { n: 'pop', p: j.pos })
    }
    return
  }
  B.stunT = Math.max(0, B.stunT - dt)
  B.protectT = Math.max(0, B.protectT - dt)
  B.launchedT = Math.max(0, B.launchedT - dt)

  /* ---- ground ---- */
  const was = B.grounded
  probeGround(world, B.pos, BIG.feet + 0.45, BIG.radius, b, gh)
  const rising = v.y > 2.5 && t - B.jumpT < 0.3
  const hanging = B.arms.some((a) => a.cable.state === 'attached')
  B.grounded = gh.hit && gh.dist <= BIG.feet + 0.12 && !rising
  gv.set(0, 0, 0)
  if (B.grounded) {
    bl.lastGround = t
    if (gh.body && !gh.body.isFixed() && !gh.ud.robot) {
      const bv = gh.body.linvel()
      gv.set(bv.x, bv.y, bv.z)
      const av = gh.body.angvel()
      const c = gh.body.translation()
      tmp.set(gh.point.x - c.x, gh.point.y - c.y, gh.point.z - c.z)
      tmp2.set(av.x, av.y, av.z).cross(tmp)
      gv.add(tmp2)
      if (gh.body.isDynamic()) gh.body.applyImpulseAtPoint({ x: 0, y: -160 * GRAVITY * dt, z: 0 }, { x: gh.point.x, y: gh.point.y, z: gh.point.z }, true)
    }
    const conv = gh.ud.conveyor as [number, number, number] | undefined
    if (conv) { const mul = gh.ud.speedVar ? (G.vars[gh.ud.speedVar] ?? 1) : 1; gv.x += conv[0] * mul; gv.z += conv[2] * mul }
  }
  if (!was && B.grounded) {
    const impact = clamp(-bl.prevVy / 14, 0.2, 1)
    B.landT = t
    B.landImpact = impact
    B.launchedT = 0
    B.jumpKind = 'none'
    fx('sfx', { n: 'landHeavy', p: B.pos, v: impact })
    fx('particles', { n: 'dust', p: { x: B.pos.x, y: B.pos.y - BIG.feet + 0.1, z: B.pos.z }, s: 1.2 + impact })
    fx('shake', { a: 0.25 * impact })
  }
  bl.prevVy = v.y

  /* ---- legs ---- */
  const m0 = P[0].move
  const m1 = P[1].move
  const a0 = m0.length() > 0.15
  const a1 = m1.length() > 0.15
  B.legs[0].move.copy(m0); B.legs[1].move.copy(m1)
  B.legs[0].anchored = P[0].brake; B.legs[1].anchored = P[1].brake
  B.legs[0].push = m0.length(); B.legs[1].push = m1.length()
  let speed = 0
  let turnRate = BIG.turnRate
  avg.set(0, 0, 0)
  if (a0 && a1) {
    avg.copy(m0).add(m1).multiplyScalar(0.5)
    speed = BIG.speed * Math.min(1, avg.length())
    const cross = m0.x * m1.z - m0.z * m1.x
    B.torsion = clamp(cross, -1, 1) * (1 - Math.max(0, m0.clone().normalize().dot(m1.clone().normalize())))
  } else if (a0 || a1) {
    const m = a0 ? m0 : m1
    avg.copy(m)
    speed = BIG.oneLegSpeed * Math.min(1, m.length())
    B.torsion = (a0 ? 0.35 : -0.35) * m.length()
  } else B.torsion = 0
  // Anchoring one leg turns the other leg's push into a pivot.
  const anchored0 = P[0].brake && B.grounded
  const anchored1 = P[1].brake && B.grounded
  if ((anchored0 && a1 && !a0) || (anchored1 && a0 && !a1)) { speed *= 0.3; turnRate = 9 }
  if (anchored0 && anchored1) speed = 0
  // Hands on fixed handles hold the body in place; legs only lever.
  const holdingFixed = B.arms.some((a) => a.grip && !a.grip.startsWith('f'))
  if (holdingFixed) speed = 0
  if (B.carrying) speed *= 0.8
  if (B.stunT > 0) speed = 0
  const dir = avg.lengthSq() > 1e-4 ? tmp.copy(avg).normalize() : tmp.set(0, 0, 0)
  target.copy(dir).multiplyScalar(speed)
  rel.set(v.x - gv.x, 0, v.z - gv.z)
  if (hanging && !B.grounded) {
    rel.addScaledVector(avg, 7 * dt)
  } else if (!B.grounded && B.launchedT > 0) {
    rel.addScaledVector(target, 1.5 * dt)
  } else {
    const accel = B.grounded ? BIG.accelGround : BIG.accelAir
    tmp2.copy(target).sub(rel)
    const d = tmp2.length()
    if (d > accel * dt) tmp2.multiplyScalar((accel * dt) / d)
    rel.add(tmp2)
  }
  v.x = rel.x + gv.x
  v.z = rel.z + gv.z
  if (avg.lengthSq() > 0.02 && B.stunT <= 0 && !holdingFixed && !(hanging && !B.grounded)) B.yaw = dampAngle(B.yaw, Math.atan2(avg.x, avg.z), turnRate, dt)

  /* ---- jumping: unilateral hop, upgraded to a joint jump ---- */
  const W = window_(BIG.jumpWindow)
  for (let i = 0; i < 2; i++) {
    for (const jt of P[i].jumps) {
      const other = 1 - i
      B.ready[i] = 1
      fx('sfx', { n: i === 0 ? 'beepCyan' : 'beepAmber', p: B.pos, v: 0.6 })
      // Mid-air: an arm on a ring + A = release that arm with a kick.
      const arm = B.arms[i].cable
      if (!B.grounded && arm.state === 'attached') {
        arm.state = 'retract'; arm.anchorId = null
        v.y = Math.max(v.y, 0) + 3
        B.jumpPress[i] = jt
        continue
      }
      const coyote = t - bl.lastGround < 0.14
      if (B.grounded || coyote) {
        if (Math.abs(jt - B.jumpPress[other]) <= W && t - B.jumpPress[other] < W + 0.1) jointJump(B)
        else {
          v.y = BIG.hopVel + Math.max(0, gv.y)
          B.jumpKind = 'hop'
          B.jumpT = t
          bl.hopOwner = i
          B.grounded = false
          bl.lastGround = -9
          fx('sfx', { n: 'jump', p: B.pos })
        }
      } else if (B.jumpKind === 'hop' && bl.hopOwner === other && Math.abs(jt - B.jumpPress[other]) <= W && t - B.jumpT < 0.45) {
        jointJump(B)
      }
      B.jumpPress[i] = jt
    }
    P[i].jumps.length = 0
  }

  function jointJump(B: Combined) {
    const along = avg.lengthSq() > 0.02 ? tmp2.copy(avg).normalize() : tmp2.set(Math.sin(B.yaw), 0, Math.cos(B.yaw))
    v.y = BIG.jointVel + Math.max(0, gv.y)
    v.x += along.x * BIG.jointForward
    v.z += along.z * BIG.jointForward
    B.jumpKind = 'joint'
    B.jumpT = t
    B.grounded = false
    bl.lastGround = -9
    G.stats.jointJumps++
    fx('sfx', { n: 'jumpBig', p: B.pos })
    fx('particles', { n: 'dust', p: { x: B.pos.x, y: B.pos.y - BIG.feet, z: B.pos.z }, s: 1.8 })
    fx('particles', { n: 'stars', p: B.pos })
    fx('joint', {})
  }

  if (B.grounded && t - B.jumpT > 0.1) {
    v.y = gv.y
    const gap = gh.dist - BIG.feet
    if (gap > 0.005) v.y -= gap * 25
  } else if (!B.grounded) {
    const g = B.launchedT > 0 ? GRAVITY : v.y < 0 ? GRAVITY * 1.3 : GRAVITY
    v.y -= g * dt
    v.y = Math.max(v.y, -34)
  }

  /* ---- arms ---- */
  stepArms(world, B, P, dt, t)

  for (let i = 0; i < 2; i++) B.ready[i] = Math.max(0, B.ready[i] - dt * 3)
  B.vel.copy(v)
  b.setLinvel({ x: v.x, y: v.y, z: v.z }, true)
  if (B.pos.y < G.killY && !B.dead) {
    B.dead = true
    B.deadT = t
    G.stats.falls++
    fx('sfx', { n: 'fall', p: B.pos })
  }
}

function stepArms(world: World, B: Combined, P: [PilotFrame, PilotFrame], dt: number, t: number) {
  const CW = window_(BIG.cableWindow)
  let slingArms = 0
  let slingGroup: string | null = null
  let slingTo: Vector3 | null = null
  let slingTime = 1
  let tensionSum = 0

  for (let i = 0; i < 2; i++) {
    const arm = B.arms[i]
    const c = arm.cable
    const pf = P[i]
    arm.aim.copy(pf.aim)
    shoulderPos(B, i, tmp2)

    // RT grip on handles (crab front, fuse…).
    if (pf.grab) {
      if (!arm.grip) {
        let best: Anchor | null = null
        let bd = BIG.gripRange + (settings().assist ? 0.6 : 0)
        for (const a of G.anchors.values()) {
          if (!a.enabled || a.kind !== 'handle') continue
          if (B.arms[1 - i].grip === a.id) continue
          const d = a.pos.distanceTo(tmp2)
          if (d < bd) { bd = d; best = a }
        }
        if (best) { arm.grip = best.id; fx('sfx', { n: 'grab', p: best.pos }) }
      }
    } else if (arm.grip) {
      arm.grip = null
      fx('sfx', { n: 'release', p: tmp2 })
    }
    if (arm.grip && !G.anchors.get(arm.grip)?.enabled) arm.grip = null

    for (const xt of pf.xs) {
      if (c.state === 'idle' && !arm.grip) {
        const a = pickBigTarget(world, B, i, pf.aim)
        c.state = 'flying'
        c.t = t
        c.tip.copy(tmp2)
        c.charge = 0
        if (a) { c.anchorId = a.id; c.target.copy(a.pos); c.hit = true }
        else { c.anchorId = null; c.target.copy(tmp2).addScaledVector(pf.aim, BIG.armRange * 0.8); c.hit = false }
        fx('sfx', { n: 'cableFire', p: tmp2 })
      } else if (c.state === 'attached') {
        const a = c.anchorId ? G.anchors.get(c.anchorId) : null
        const otherC = B.arms[1 - i].cable
        const otherA = otherC.anchorId ? G.anchors.get(otherC.anchorId) : null
        const slingReady = a?.sling && otherA?.sling && a.sling.group === otherA.sling.group && otherC.state === 'attached' && B.tension > 0.95
        if (slingReady) {
          B.xPress[i] = xt
          if (Math.abs(xt - B.xPress[1 - i]) <= CW) {
            // Double confirmation inside the window: fire the slingshot.
            const to = a!.sling!.to
            v.copy(ballistic(B.pos, tmp.copy(to).setY(to.y + 1.2), a!.sling!.time, GRAVITY))
            for (const arm2 of B.arms) { arm2.cable.state = 'retract'; arm2.cable.anchorId = null }
            B.launchedT = a!.sling!.time
            B.jumpT = t
            B.grounded = false
            B.tension = 0
            G.stats.jointJumps++
            fx('sfx', { n: 'spring', p: B.pos, v: 1.4 })
            fx('sfx', { n: 'whoosh', p: B.pos })
            fx('particles', { n: 'merge', p: B.pos })
            fx('shake', { a: 0.5 })
            fx('sling', {})
            return
          }
          fx('sfx', { n: i === 0 ? 'beepCyan' : 'beepAmber', p: B.pos })
          if (t - bl.slingNag > 2) { bl.slingNag = t; fx('hint', { text: 'Cable cargado: ¡falta la confirmación de tu compañero!' }) }
        } else {
          c.state = 'retract'
          c.anchorId = null
          fx('sfx', { n: 'release', p: tmp2 })
        }
      }
    }
    pf.xs.length = 0

    if (c.state === 'flying') {
      if (c.anchorId) { const a = G.anchors.get(c.anchorId); if (a) c.target.copy(a.pos) }
      tmp.copy(c.target).sub(c.tip)
      const d = tmp.length()
      const step = BIG.armSpeed * dt
      if (d <= step) {
        c.tip.copy(c.target)
        const a = c.anchorId ? G.anchors.get(c.anchorId) : null
        if (!c.hit || !a || !a.enabled) { c.state = 'retract'; continue }
        c.state = 'attached'
        c.len = Math.max(BIG.minRope, B.pos.distanceTo(a.pos))
        G.stats.rings++
        fx('sfx', { n: 'cableHit', p: a.pos })
        fx('particles', { n: 'spark', p: a.pos })
        fx('ringHit', { id: a.id, side: i })
      } else c.tip.addScaledVector(tmp, step / d)
      continue
    }
    if (c.state === 'retract') {
      tmp.copy(tmp2).sub(c.tip)
      const d = tmp.length()
      const step = BIG.armSpeed * 1.3 * dt
      if (d <= step) { c.state = 'idle'; c.anchorId = null; c.reeling = false }
      else c.tip.addScaledVector(tmp, step / d)
      continue
    }
    if (c.state === 'attached') {
      const a = c.anchorId ? G.anchors.get(c.anchorId) : null
      if (!a || !a.enabled) { c.state = 'retract'; c.anchorId = null; continue }
      c.tip.copy(a.pos)
      c.target.copy(a.pos)
      c.reeling = pf.reel
      if (pf.reel && c.len > BIG.minRope) {
        c.len = Math.max(BIG.minRope, c.len - BIG.reelSpeed * dt)
        if (Math.floor(t * 10) !== Math.floor((t - dt) * 10)) fx('sfx', { n: 'cableReel', p: a.pos }, false)
      }
      tmp.copy(a.pos).sub(B.pos)
      const dist = tmp.length()
      tmp.divideScalar(Math.max(dist, 1e-3))
      if (dist > c.len) {
        const radial = v.dot(tmp)
        if (radial < 0) v.addScaledVector(tmp, -radial * 0.5)
        v.addScaledVector(tmp, Math.min(dist - c.len, 1.5) * 8)
        if (B.grounded && a.pos.y > B.pos.y + 0.5) B.grounded = false
      } else if (dist < c.len + 0.1) {
        // Don't overshoot past the anchor when reeling hard.
        const radial = v.dot(tmp)
        if (radial > 0) v.addScaledVector(tmp, -radial * 0.2)
      }
      if (a.sling) {
        slingArms++
        slingGroup = slingGroup === null || slingGroup === a.sling.group ? a.sling.group : '__mixed'
        slingTo = a.sling.to
        slingTime = a.sling.time
        tensionSum += clamp(1 - (c.len - BIG.minRope) / 2.5, 0, 1)
      }
    }
  }
  void slingTo; void slingTime
  const prevT = B.tension
  B.tension = slingArms === 2 && slingGroup !== '__mixed' ? tensionSum / 2 : 0
  if (B.tension > 0.95 && prevT <= 0.95) {
    fx('sfx', { n: 'charge', p: B.pos })
    fx('slingReady', {})
  }
  if (!B.grounded && B.arms.some((a) => a.cable.state === 'attached')) v.multiplyScalar(1 - 0.06 * dt)
}

/** Couple-out consent: both pilots hold Y on the ground. */
export function bigWantsSplit(B: Combined, P: [PilotFrame, PilotFrame], dt: number) {
  for (let i = 0; i < 2; i++) bl.coupleT[i] = P[i].couple && B.grounded ? bl.coupleT[i] + dt : 0
  return bl.coupleT
}

export function resetBigLocals() {
  bl.lastGround = 0
  bl.prevVy = 0
  bl.hopOwner = -1
  bl.coupleT = [0, 0]
}

export function hintToast(text: string) { toast(text, 'warn') }
