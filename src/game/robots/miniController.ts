import { Vector3 } from 'three'
import type { World } from '@dimforge/rapier3d-compat'
import { G, act, ballistic, clamp, dampAngle, fx, plateUnder, type Anchor, type Mini } from '../runtime'
import { GRAVITY, MINI } from '../tuning'
import type { StepInput } from '../control'
import { lineOfSight, newGroundHit, probeGround, raycastPoint, wallProbe } from './physicsUtil'
import { settings } from '../../core/settings'
import { rumble } from '../../core/input'

/**
 * Character controller for a mini robot owned by this client (human or AI).
 * The body is a zero-friction capsule with gravity disabled; every velocity
 * component is decided here, which is what makes the control feel exact.
 */

interface Local {
  noCatchUntil: number
  lastGround: number
  jumpBuf: number
  netT: number
  netTo: Vector3 | null
  prevVy: number
  grabHeldSince: number
  stepPhase: number
  /** Wall grip already used this airtime (and the wall it was on). */
  clingUsed: boolean
  clingLastN: Vector3
}
const locals = new WeakMap<Mini, Local>()
const L = (m: Mini): Local => {
  let l = locals.get(m)
  if (!l) locals.set(m, (l = { noCatchUntil: 0, lastGround: 0, jumpBuf: -9, netT: -9, netTo: null, prevVy: 0, grabHeldSince: -9, stepPhase: 0, clingUsed: false, clingLastN: new Vector3() }))
  return l
}

const gh = newGroundHit()
const v = new Vector3()
const gv = new Vector3()
const rel = new Vector3()
const target = new Vector3()
const tmp = new Vector3()
const tmp2 = new Vector3()
const fwd = new Vector3()
const UP = new Vector3(0, 1, 0)

const jumpVel = Math.sqrt(2 * GRAVITY * MINI.jumpHeight)

export function carryPoint(m: Mini, out: Vector3) {
  return out.set(m.pos.x, m.pos.y + 0.98, m.pos.z)
}

export function facing(m: Mini, out: Vector3) {
  return out.set(Math.sin(m.yaw), 0, Math.cos(m.yaw))
}

/** Where the right hand / offered glove is. */
export function gloveRest(m: Mini, out: Vector3) {
  facing(m, fwd)
  return out.copy(m.pos).addScaledVector(fwd, 0.62).addScaledVector(UP, 0.02)
}

/** Right hand in world space: local (-0.28, 0.12, 0.2) rotated by yaw. */
export function handPos(m: Mini, out: Vector3) {
  const s = Math.sin(m.yaw)
  const c = Math.cos(m.yaw)
  return out.set(m.pos.x - 0.28 * c + 0.2 * s, m.pos.y + 0.12, m.pos.z + 0.28 * s + 0.2 * c)
}

function moveTowards(cur: Vector3, to: Vector3, maxDelta: number) {
  tmp.copy(to).sub(cur)
  const d = tmp.length()
  if (d <= maxDelta || d < 1e-5) cur.copy(to)
  else cur.addScaledVector(tmp, maxDelta / d)
}

export function killMini(m: Mini) {
  if (m.dead) return
  m.dead = true
  m.deadT = G.time
  G.stats.falls++
  releaseAll(m)
  fx('sfx', { n: 'fall', p: m.pos })
}

function releaseAll(m: Mini) {
  if (m.carrying) { act('drop', { id: m.carrying, v: [0, 0, 0] }); m.carrying = null }
  m.cable.state = m.cable.state === 'idle' ? 'idle' : 'retract'
  m.cable.anchorId = null
  m.cable.charge = 0
  m.hangOn = -1
  m.offering = false
  m.towing = false
  m.cling = false
}

export function respawnMini(m: Mini, at: Vector3, yaw: number) {
  m.dead = false
  m.pos.copy(at)
  m.vel.set(0, 0, 0)
  m.yaw = yaw
  m.protectT = 1.5
  m.stunT = 0
  m.launchedT = 0
  m.hangOn = -1
  m.cable.state = 'idle'
  m.cable.anchorId = null
  m.carrying = null
  m.towing = false
  m.cling = false
  if (m.body) {
    m.body.setTranslation({ x: at.x, y: at.y, z: at.z }, true)
    m.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
  }
  L(m).lastGround = G.time
  fx('particles', { n: 'poof', p: { x: at.x, y: at.y, z: at.z }, c: '#ffffff' })
  fx('sfx', { n: 'pop', p: at })
}

/* ------------------------------------------------------------ Targeting */

export interface TargetPick { kind: 'anchor' | 'robot' | 'none'; anchor: Anchor | null; point: Vector3 }

const pick: TargetPick = { kind: 'none', anchor: null, point: new Vector3() }

/** Best thing the contextual hook can reach along the aim direction. */
export function pickMiniTarget(world: World, m: Mini, aim: Vector3, partner: Mini): TargetPick {
  pick.kind = 'none'
  pick.anchor = null
  let best = Infinity
  handPos(m, tmp2)
  const range = MINI.cableRange + (settings().assist ? 0.6 : 0)
  for (const a of G.anchors.values()) {
    if (!a.enabled || !a.mini || !HOOKABLE.has(a.kind)) continue
    if (a.kind === 'glove' && a.id === `glove:${m.slot}`) continue
    tmp.copy(a.pos).sub(tmp2)
    const d = tmp.length()
    if (d > range || d < 0.4) continue
    tmp.divideScalar(d)
    const dot = tmp.dot(aim)
    // Generous cone, extra generous for things above us (rings).
    const cone = a.pos.y > m.pos.y + 0.5 ? 0.15 : 0.45
    if (dot < cone) continue
    const score = d * 0.6 + (1 - dot) * 6 - (a.kind === 'glove' ? 1.5 : 0)
    if (score < best && lineOfSight(world, tmp2, a.pos, m.body)) { best = score; pick.kind = 'anchor'; pick.anchor = a; pick.point.copy(a.pos) }
  }
  void partner
  return pick
}

/** What the contextual button hooks (rings, crab latches, the partner's offered hand). */
const HOOKABLE = new Set(['ring', 'latch', 'glove'])
/** What a punch can hit besides the partner. */
const PUNCHABLE = new Set(['bell', 'button', 'enemy'])

/**
 * Punch target: the nearest bell / button / enemy within reach, else the
 * partner. Generous on direction (the robot turns to face it), strict on reach.
 */
export function pickPunchTarget(world: World, m: Mini, partner: Mini): TargetPick {
  pick.kind = 'none'
  pick.anchor = null
  let best = Infinity
  facing(m, fwd)
  tmp2.copy(m.pos).addScaledVector(UP, 0.15)
  const reach = MINI.punchRange + (settings().assist ? 0.4 : 0)
  for (const a of G.anchors.values()) {
    if (!a.enabled || !a.mini || !PUNCHABLE.has(a.kind)) continue
    tmp.copy(a.pos).sub(tmp2)
    const d = tmp.length()
    if (d > reach) continue
    const flat = Math.hypot(tmp.x, tmp.z)
    const dot = flat > 0.05 ? (tmp.x * fwd.x + tmp.z * fwd.z) / flat : 1
    if (dot < -0.3) continue
    const score = d + (1 - dot) * 0.8 - (a.owner === m.slot ? 0.5 : 0)
    if (score < best && lineOfSight(world, tmp2, a.pos, m.body)) { best = score; pick.kind = 'anchor'; pick.anchor = a; pick.point.copy(a.pos) }
  }
  if (!partner.hidden && !partner.dead && partner.hangOn !== m.slot && m.hangOn < 0) {
    tmp.copy(partner.pos).sub(m.pos)
    const d = tmp.length()
    const flat = Math.hypot(tmp.x, tmp.z)
    const dot = flat > 0.05 ? (tmp.x * fwd.x + tmp.z * fwd.z) / flat : 1
    if (d < MINI.punchPartnerRange && dot > -0.2 && d + (1 - dot) * 0.8 < best) { pick.kind = 'robot'; pick.anchor = null; pick.point.copy(partner.pos) }
  }
  return pick
}

/* ------------------------------------------------------------ Step */

export function stepMini(world: World, m: Mini, inp: StepInput, dt: number, partner: Mini) {
  const b = m.body
  if (!b) return
  const l = L(m)
  const t = G.time
  if (m.hidden) return

  const p = b.translation()
  const lv = b.linvel()
  m.pos.set(p.x, p.y, p.z)
  v.set(lv.x, lv.y, lv.z)

  if (m.dead) {
    b.setLinvel({ x: 0, y: 0, z: 0 }, true)
    if (t - m.deadT > MINI.respawnDelay && G.checkpoint) respawnMini(m, G.checkpoint.spawns[m.slot], G.checkpoint.yaw)
    return
  }

  m.stunT = Math.max(0, m.stunT - dt)
  m.protectT = Math.max(0, m.protectT - dt)
  m.launchedT = Math.max(0, m.launchedT - dt)
  m.boosting = Math.max(0, m.boosting - dt)

  /* ---- ground ---- */
  const wasGrounded = m.grounded
  probeGround(world, m.pos, MINI.feet + 0.35, MINI.radius, b, gh)
  const rising = v.y > 2.5 && t - m.jumpT < 0.25
  m.grounded = gh.hit && gh.dist <= MINI.feet + 0.09 && !rising && m.hangOn < 0
  gv.set(0, 0, 0)
  if (m.grounded) {
    l.lastGround = t
    if (gh.body && !gh.body.isFixed() && !gh.ud.robot) {
      const bv = gh.body.linvel()
      gv.set(bv.x, bv.y, bv.z)
      // Rotating platforms (seesaw): add tangential velocity at the contact.
      const av = gh.body.angvel()
      const c = gh.body.translation()
      tmp.set(gh.point.x - c.x, gh.point.y - c.y, gh.point.z - c.z)
      tmp2.set(av.x, av.y, av.z).cross(tmp)
      gv.add(tmp2)
      if (gh.body.isDynamic()) {
        // Weight on dynamic platforms (we have no gravity of our own).
        gh.body.applyImpulseAtPoint({ x: 0, y: -45 * GRAVITY * dt, z: 0 }, { x: gh.point.x, y: gh.point.y, z: gh.point.z }, true)
      }
    }
    const conv = gh.ud.conveyor as [number, number, number] | undefined
    if (conv) {
      const mul = gh.ud.speedVar ? (G.vars[gh.ud.speedVar] ?? 1) : 1
      gv.x += conv[0] * mul; gv.z += conv[2] * mul
    }
  }

  if (m.grounded) { l.clingUsed = false; m.cling = false }
  if (!wasGrounded && m.grounded) {
    const impact = clamp(-l.prevVy / 16, 0.15, 1)
    m.landT = t
    m.landImpact = impact
    m.launchedT = 0
    if (impact > 0.35) {
      fx('particles', { n: 'dust', p: { x: m.pos.x, y: m.pos.y - MINI.feet + 0.05, z: m.pos.z }, s: 0.6 + impact * 0.6 })
      fx('sfx', { n: 'land', p: m.pos, v: impact })
    }
    if (m.kind === 'local' && impact > 0.6) rumble(0.3 * impact, 0.2, 80)
    if (gh.ud.net) {
      l.netT = t
      l.netTo = new Vector3(...(gh.ud.net as [number, number, number]))
      fx('sfx', { n: 'net', p: m.pos })
      m.landImpact = 1
    }
    if (gh.ud.bounce) {
      v.y = gh.ud.bounce as number
      m.grounded = false
      m.jumpT = t
      m.landT = t
      fx('sfx', { n: 'spring', p: m.pos })
      fx('particles', { n: 'stars', p: { x: m.pos.x, y: m.pos.y - 0.4, z: m.pos.z } })
    }
    // Springboard: landing on the partner's head always bounces you up.
    if (gh.ud.robot === partner.slot + 1 && !partner.hidden && l.prevVy < -0.5 && !m.towing && partner.hangOn < 0) {
      v.y = MINI.boostVel
      m.grounded = false
      m.jumpT = t
      m.boosting = 0.6
      m.launchedT = 0.15
      fx('sfx', { n: 'boost', p: m.pos })
      fx('particles', { n: 'stars', p: { x: m.pos.x, y: m.pos.y - 0.4, z: m.pos.z } })
      fx('boost', { slot: partner.slot })
    }
  }
  l.prevVy = v.y

  // Net return: after a short bounce, fling back to the safe ledge.
  if (l.netTo && t - l.netT > 0.45 && m.grounded) {
    v.copy(ballistic(m.pos, tmp.copy(l.netTo).setY(l.netTo.y + MINI.feet), 1.0, GRAVITY))
    m.launchedT = 1.0
    m.grounded = false
    m.jumpT = t
    l.netTo = null
    fx('sfx', { n: 'spring', p: m.pos })
  }

  /* ---- intentions ---- */
  const stunned = m.stunT > 0
  const move = stunned ? tmp.set(0, 0, 0) : inp.move
  m.moveMag = move.length()

  const grabToggle = settings().grabToggle
  if (inp.pressed.grab) l.grabHeldSince = t
  const grabHeld = grabToggle ? m.offering || (inp.pressed.grab && !m.offering) : inp.held.grab

  // Emotes & ping.
  for (const [i, k] of (['emote1', 'emote2', 'emote3', 'emote4'] as const).entries()) {
    if (inp.pressed[k]) { m.emote = i + 1; m.emoteT = t; fx('sfx', { n: 'emote', p: m.pos }) }
  }

  /* ---- hanging from the partner's hand ---- */
  if (m.hangOn >= 0) {
    const holder = G.minis[m.hangOn]
    if (!holder.offering || holder.dead || holder.hidden) {
      // Let go (holder released or lost footing).
      m.hangOn = -1
      if (m.cable.anchorId?.startsWith('glove')) { m.cable.state = 'retract'; m.cable.anchorId = null }
      fx('sfx', { n: 'release', p: m.pos })
    } else {
      m.hangT += dt
      // Hang a little in front of and below the hand, clear of the holder.
      tmp2.set(holder.glove.x - holder.pos.x, 0, holder.glove.z - holder.pos.z).normalize()
      target.copy(holder.glove).addScaledVector(UP, -0.7).addScaledVector(tmp2, 0.25)
      tmp.copy(target).sub(m.pos).multiplyScalar(14)
      if (tmp.length() > 12) tmp.setLength(12)
      v.copy(tmp).add(holder.vel)
      v.y = tmp.y + holder.vel.y
      m.yaw = dampAngle(m.yaw, Math.atan2(holder.pos.x - m.pos.x, holder.pos.z - m.pos.z), 8, dt)
      const letGo = !grabHeld && !m.cable.anchorId?.startsWith('glove') && t - l.grabHeldSince > 0.25
      if (holder.hoist >= 0.98 || inp.pressed.jump) {
        // Climb! A predictable hop that lands beside and behind the holder.
        facing(holder, fwd)
        const side = (m.slot === 0 ? 1 : -1) * 0.75
        target.set(holder.pos.x - fwd.x * 1.2 + fwd.z * side, holder.pos.y + 0.05, holder.pos.z - fwd.z * 1.2 - fwd.x * side)
        v.copy(ballistic(m.pos, target, 0.62, GRAVITY))
        m.launchedT = 0.62
        m.ghostT = t + 0.75
        l.noCatchUntil = t + 1
        m.hangOn = -1
        m.jumpT = t
        if (m.cable.anchorId?.startsWith('glove')) { m.cable.state = 'retract'; m.cable.anchorId = null }
        if (holder.hoist >= 0.98) act('rescue', { holder: holder.slot })
        fx('sfx', { n: 'boost', p: m.pos })
        fx('particles', { n: 'stars', p: { x: m.pos.x, y: m.pos.y + 0.5, z: m.pos.z } })
      } else if (letGo) {
        l.noCatchUntil = t + 0.5
        m.hangOn = -1
        fx('sfx', { n: 'release', p: m.pos })
      }
      finish(m, v, dt, move)
      return
    }
  }

  /* ---- being dragged by the partner ---- */
  const dragged = partner.towing && !partner.hidden && !partner.dead && m.hangOn < 0

  /* ---- wall grip ---- */
  const catchable = partner.offering && !partner.hidden && t > l.noCatchUntil && tmp.copy(m.pos).addScaledVector(UP, 0.5).distanceTo(partner.glove) < MINI.gloveRange + 0.4
  if (m.cling) {
    const stillThere = wallProbe(world, m.pos, tmp2.copy(m.clingN).negate(), MINI.clingReach + 0.15, b, tmp)
    m.clingT += dt
    if (inp.pressed.jump) {
      // Wall jump: up and away. One per wall; the next one needs another wall.
      m.cling = false
      l.clingUsed = true
      l.clingLastN.copy(m.clingN)
      v.copy(m.clingN).multiplyScalar(MINI.wallJumpOut)
      v.y = jumpVel * MINI.wallJumpUp
      m.yaw = Math.atan2(m.clingN.x, m.clingN.z)
      m.jumpT = t
      m.launchedT = 0.22
      l.jumpBuf = -9
      fx('sfx', { n: 'jump', p: m.pos })
      fx('particles', { n: 'step', p: m.pos }, false)
      finish(m, v, dt, move)
      return
    }
    if (!grabHeld || !stillThere || m.clingT > MINI.clingTime || inp.pressed.context || catchable) {
      m.cling = false
      l.clingUsed = true
      l.clingLastN.copy(m.clingN)
      if (m.clingT > MINI.clingTime) fx('sfx', { n: 'release', p: m.pos })
    } else {
      // Stuck to the wall: slow slide, facing it.
      v.copy(m.clingN).multiplyScalar(-0.6)
      v.y = -MINI.clingSlide * Math.min(1, m.clingT / MINI.clingTime + 0.3)
      m.yaw = dampAngle(m.yaw, Math.atan2(-m.clingN.x, -m.clingN.z), 14, dt)
      m.vel.copy(v)
      b.setLinvel({ x: v.x, y: v.y, z: v.z }, true)
      return
    }
  } else if (grabHeld && !m.grounded && !m.carrying && m.cable.state === 'idle' && !catchable && v.y < 4 && t - m.jumpT > 0.12) {
    // Grab pressed (or held) against a wall in the air: stick to it.
    facing(m, fwd)
    const dirs = [fwd, tmp2.set(move.x, 0, move.z)]
    for (const d of dirs) {
      if (d.lengthSq() < 0.05) continue
      d.normalize()
      const hit = wallProbe(world, m.pos, d, MINI.clingReach, b, tmp)
      if (!hit) continue
      if (l.clingUsed && hit.dot(l.clingLastN) > 0.5) continue
      m.cling = true
      m.clingT = 0
      m.clingN.copy(hit)
      m.offering = false
      fx('sfx', { n: 'grab', p: m.pos, v: 0.8 })
      fx('particles', { n: 'spark', p: tmp })
      if (m.kind === 'local') rumble(0.25, 0.2, 50)
      v.set(0, 0, 0)
      m.vel.copy(v)
      b.setLinvel({ x: 0, y: 0, z: 0 }, true)
      return
    }
  }

  /* ---- offering a hand ---- */
  const canOffer = m.grounded && !m.carrying && m.cable.state === 'idle' && !m.towing && !dragged
  const wasOffering = m.offering
  // Once offered, keep offering while held (the partner hanging nearby must not cancel it).
  m.offering = !!grabHeld && canOffer && (wasOffering || !nearGrabbable(m, partner))
  if (m.offering && !wasOffering) fx('sfx', { n: 'grab', p: m.pos, v: 0.5 })
  if (partner.hangOn === m.slot && m.offering) {
    m.hangT += dt
    m.hoist = clamp((m.hangT - MINI.hoistDelay) / MINI.hoistTime, 0, 1)
  } else {
    m.hangT = 0
    m.hoist = 0
  }
  gloveRest(m, m.glove)
  if (m.hoist > 0) {
    facing(m, fwd)
    m.glove.addScaledVector(UP, 1.1 * m.hoist).addScaledVector(fwd, -0.5 * m.hoist)
  }

  /* ---- grab: partner glove, boxes, drop ---- */
  // Holding grab in the air means "ready to catch": take the hand as soon as it's in reach.
  if (!inp.pressed.grab && inp.held.grab && !m.grounded && !m.carrying && m.hangOn < 0 && partner.offering && !partner.hidden && t > l.noCatchUntil) {
    const range = settings().assist ? MINI.assistGloveRange : MINI.gloveRange
    tmp.copy(m.pos).addScaledVector(UP, 0.5)
    if (tmp.distanceTo(partner.glove) < range) {
      m.hangOn = partner.slot
      m.hangT = 0
      fx('sfx', { n: 'grab', p: m.pos })
      fx('particles', { n: 'burst', p: partner.glove, c: '#ffffff', s: 0.5 })
    }
  }
  if (inp.pressed.grab) {
    if (m.carrying) {
      // Drop (and never re-grab in the same press).
      facing(m, fwd)
      act('drop', { id: m.carrying, v: [v.x * 0.5 + fwd.x * 1.4, 1.6, v.z * 0.5 + fwd.z * 1.4] })
      m.carrying = null
      fx('sfx', { n: 'release', p: m.pos })
    } else {
      let took = false
      if (partner.offering && !partner.hidden) {
        const range = settings().assist ? MINI.assistGloveRange : MINI.gloveRange
        tmp.copy(m.pos).addScaledVector(UP, 0.5)
        if (tmp.distanceTo(partner.glove) < range) {
          m.hangOn = partner.slot
          m.hangT = 0
          took = true
          fx('sfx', { n: 'grab', p: m.pos })
          fx('particles', { n: 'burst', p: partner.glove, c: '#ffffff', s: 0.5 })
        }
      }
      if (!took && m.hangOn < 0) {
        const box = nearestBox(m)
        if (box) {
          m.carrying = box
          m.offering = false
          act('grab', { id: box })
          fx('sfx', { n: 'grab', p: m.pos })
        } else if (canTow(m, partner)) {
          // Grab the partner's body: they come with you while you hold.
          m.towing = true
          m.offering = false
          fx('sfx', { n: 'grab', p: partner.pos })
          fx('particles', { n: 'burst', p: partner.pos, c: '#9cc8ff', s: 0.4 })
          if (m.kind === 'local') rumble(0.3, 0.2, 60)
        }
      }
    }
  }
  if (m.towing && (!grabHeld || partner.hidden || partner.dead || m.carrying || m.hangOn >= 0 || partner.hangOn >= 0 || m.pos.distanceTo(partner.pos) > MINI.towBreak)) {
    m.towing = false
    fx('sfx', { n: 'release', p: m.pos })
  }


  /* ---- horizontal ---- */
  let maxS = m.carrying ? MINI.carrySpeed : m.towing ? MINI.towSpeed : MINI.speed
  if (m.offering) maxS = partner.hangOn === m.slot ? 0 : 1.6
  target.copy(move).multiplyScalar(maxS)
  rel.set(v.x - gv.x, 0, v.z - gv.z)
  let accel: number
  if (m.grounded) accel = target.lengthSq() > 0.01 ? MINI.accelGround : MINI.decelGround
  else accel = m.launchedT > 0 ? 7 : MINI.accelAir
  const relLen = rel.length()
  if (!m.grounded && m.launchedT > 0) {
    // Ballistic (spring, climb, net return): keep the arc, input only nudges.
    rel.addScaledVector(move, 3 * dt)
  } else if (!m.grounded && relLen > maxS + 0.5) {
    // Keep momentum from launches; input only steers.
    const along = target.dot(rel) / Math.max(relLen, 1e-3)
    tmp.copy(target).addScaledVector(rel, -along / relLen)
    rel.addScaledVector(tmp, 3 * dt)
    rel.multiplyScalar(1 - 0.35 * dt)
  } else if (m.cable.state === 'attached' && !m.grounded) {
    // Swinging: pump with the stick.
    rel.addScaledVector(move, 9 * dt)
  } else {
    moveTowards(rel, target, accel * dt)
  }
  v.x = rel.x + gv.x
  v.z = rel.z + gv.z

  // Dragged: a soft leash toward the partner holding us (our stick only struggles).
  if (dragged) {
    tmp.set(partner.pos.x - m.pos.x, 0, partner.pos.z - m.pos.z)
    const d = tmp.length()
    if (d > MINI.towRest) {
      tmp.divideScalar(d)
      const pull = Math.min(12, (d - MINI.towRest) * 9)
      const tx = partner.vel.x * 0.9 + tmp.x * pull + move.x * 1.2
      const tz = partner.vel.z * 0.9 + tmp.z * pull + move.z * 1.2
      const k = Math.min(1, 14 * dt)
      v.x += (tx - v.x) * k
      v.z += (tz - v.z) * k
      if (m.grounded && Math.abs(partner.vel.x) + Math.abs(partner.vel.z) > 0.5) m.yaw = dampAngle(m.yaw, Math.atan2(tmp.x, tmp.z), 6, dt)
    }
  }

  /* ---- vertical ---- */
  if (inp.pressed.jump) l.jumpBuf = t
  const coyoteOk = t - l.lastGround < MINI.coyote
  if (t - l.jumpBuf < MINI.buffer && (m.grounded || coyoteOk) && m.cable.state !== 'attached' && !stunned) {
    const jv = jumpVel * (m.carrying ? 0.82 : 1)
    v.y = jv + Math.max(0, gv.y)
    m.grounded = false
    m.jumpT = t
    l.jumpBuf = -9
    l.lastGround = -9
    fx('sfx', { n: 'jump', p: m.pos })
    fx('particles', { n: 'step', p: { x: m.pos.x, y: m.pos.y - MINI.feet + 0.05, z: m.pos.z } }, false)
  }

  if (m.grounded && t - m.jumpT > 0.08) {
    v.y = gv.y
    // Glue to the floor on small steps / slopes.
    const gap = gh.dist - MINI.feet
    if (gap > 0.005) v.y -= gap * 30
  } else if (!m.grounded) {
    let g = GRAVITY
    if (m.launchedT > 0) g = GRAVITY
    else if (v.y < 0) g *= MINI.fallMult
    else if (!inp.held.jump && t - m.jumpT < 0.6 && m.boosting <= 0) g *= MINI.jumpCut
    else if (Math.abs(v.y) < 1.6 && inp.held.jump) g *= 1 - MINI.apexHang
    v.y -= g * dt
    v.y = Math.max(v.y, -32)
  }

  /* ---- contextual: couple on a plate, otherwise the hook ---- */
  const plate = m.grounded && G.form === 'split' ? plateUnder(m) : null
  m.coupleHold = plate && inp.held.context && m.cable.state === 'idle' ? m.coupleHold + dt : 0
  stepCable(world, m, inp, dt, partner, !plate)

  /* ---- punch (or throw the carried box) ---- */
  if (inp.pressed.punch && t - m.punchT > MINI.punchCooldown && m.hangOn < 0) {
    if (m.carrying) {
      facing(m, fwd)
      act('drop', { id: m.carrying, v: [v.x + fwd.x * 7.5, 4.5, v.z + fwd.z * 7.5] })
      m.carrying = null
      m.punchT = t
      fx('sfx', { n: 'whoosh', p: m.pos })
    } else if (m.cable.state === 'idle') {
      punch(world, m, partner)
    }
  }

  if (inp.pressed.signal && m.kind === 'local') {
    fwd.copy(G.cam.fwd)
    const hit = raycastPoint(world, G.cam.pos, fwd, 60, m.body, tmp2)
    m.ping = hit > 0 ? tmp2.clone() : m.pos.clone().addScaledVector(fwd, 10)
    m.pingT = t
    fx('sfx', { n: m.slot === 0 ? 'beepCyan' : 'beepAmber', p: m.pos })
    fx('ping', { slot: m.slot, p: m.ping })
  }

  finish(m, v, dt, move)
}

function finish(m: Mini, vel: Vector3, dt: number, move: Vector3) {
  const b = m.body!
  // Facing.
  if (m.hangOn < 0) {
    if (move.lengthSq() > 0.01 && m.stunT <= 0) m.yaw = dampAngle(m.yaw, Math.atan2(move.x, move.z), MINI.turnRate, dt)
    else if (m.cable.state === 'attached') m.yaw = dampAngle(m.yaw, Math.atan2(m.cable.target.x - m.pos.x, m.cable.target.z - m.pos.z), 6, dt)
  }
  m.vel.copy(vel)
  b.setLinvel({ x: vel.x, y: vel.y, z: vel.z }, true)
  if (m.pos.y < G.killY) killMini(m)
}

/* ------------------------------------------------------------ Cable */

/**
 * One-button hook, Spider-style: press to fire, keep holding to stay latched
 * and reel in (at full reel the spring charges), release to let go. Releasing
 * with charge fires the spring; releasing mid-swing keeps the arc's momentum.
 * A quick tap that lands after the button is up becomes a short yank.
 */
function stepCable(world: World, m: Mini, inp: StepInput, dt: number, partner: Mini, canFire = true) {
  const c = m.cable
  const t = G.time
  const hold = !!inp.held.context || !!inp.pressed.context
  handPos(m, tmp2)

  if (canFire && inp.pressed.context && !m.carrying && m.hangOn < 0 && c.state === 'idle') {
    // Contextual: only fires at something that glows (a hook target in reach).
    const pk = pickMiniTarget(world, m, inp.aim, partner)
    if (pk.kind === 'anchor') {
      c.tip.copy(tmp2)
      c.state = 'flying'
      c.t = t
      c.charge = 0
      c.punch = false
      c.anchorId = pk.anchor!.id
      c.target.copy(pk.anchor!.pos)
      c.hit = true
      m.cling = false
      fx('sfx', { n: 'cableFire', p: m.pos })
    }
  }

  if (c.state === 'flying') {
    // Track moving targets.
    if (c.anchorId?.startsWith('robot:')) c.target.copy(partner.pos)
    else if (c.anchorId) { const a = G.anchors.get(c.anchorId); if (a) c.target.copy(a.pos) }
    tmp.copy(c.target).sub(c.tip)
    const d = tmp.length()
    const step = MINI.cableSpeed * dt
    if (d <= step) {
      c.tip.copy(c.target)
      if (!c.hit) { c.state = 'retract'; return }
      const a = c.anchorId ? G.anchors.get(c.anchorId) : null
      if (c.anchorId?.startsWith('robot:')) {
        // Playful punch. Strong inside the arena, gentle elsewhere.
        tmp.copy(partner.pos).sub(m.pos).setY(0).normalize()
        const strong = !!G.vars.arenaLive
        punchPartner(partner, tmp, strong ? 7.5 : 3.5)
        fx('sfx', { n: 'bonk', p: partner.pos })
        fx('particles', { n: 'stars', p: partner.pos })
        if (m.kind === 'local') rumble(0.4, 0.3, 70)
        c.state = 'retract'
        return
      }
      if (!a || !a.enabled) { c.state = 'retract'; return }
      fx('sfx', { n: c.punch ? 'bonk' : 'cableHit', p: a.pos })
      fx('particles', { n: c.punch ? 'stars' : 'spark', p: a.pos })
      if (c.punch) {
        if (a.kind === 'bell') act('bell', { id: a.id })
        else act('punch', { id: a.id })
        if (m.kind === 'local') rumble(0.4, 0.3, 70)
        c.state = 'retract'
        return
      }
      if (a.kind === 'glove') {
        c.state = 'attached'
        c.len = Math.max(MINI.minRope, m.pos.distanceTo(a.pos))
        m.hangOn = partner.slot
        m.hangT = 0
        return
      }
      if (!hold) {
        // Tapped: yank toward the anchor and let go straight away.
        yank(m, a.pos)
        c.state = 'retract'
        c.anchorId = null
        G.stats.rings++
        return
      }
      c.state = 'attached'
      c.len = Math.max(MINI.minRope, m.pos.distanceTo(a.pos))
      G.stats.rings++
      if (m.kind === 'local') rumble(0.2, 0.4, 60)
    } else {
      c.tip.addScaledVector(tmp, step / d)
    }
    return
  }

  if (c.state === 'retract') {
    tmp.copy(tmp2).sub(c.tip)
    const d = tmp.length()
    const step = MINI.cableSpeed * 1.2 * dt
    if (d <= step) { c.state = 'idle'; c.anchorId = null; c.charge = 0; c.reeling = false; c.punch = false }
    else c.tip.addScaledVector(tmp, step / d)
    return
  }

  if (c.state === 'attached') {
    const a = c.anchorId ? G.anchors.get(c.anchorId) : null
    if (!a || !a.enabled) { detach(m, 0); return }
    c.target.copy(a.pos)
    c.tip.copy(a.pos)
    if (a.kind === 'glove') {
      // Hanging handled by the hand logic; the cable is just the visual.
      if (m.hangOn < 0) { c.state = 'retract'; c.anchorId = null }
      return
    }
    if (inp.pressed.jump && !m.grounded) { detach(m, 5.5); return }

    if (!hold) {
      c.reeling = false
      if (c.charge > 0.12) { springLaunch(m, a, inp); return }
      detach(m, m.grounded ? 0 : MINI.releaseBoost)
      return
    }

    // Holding: reel in, and at full reel wind the spring.
    c.reeling = true
    if (c.len > MINI.minRope + 0.01) {
      c.len = Math.max(MINI.minRope, c.len - MINI.reelSpeed * dt)
      if (Math.floor(t * 12) !== Math.floor((t - dt) * 12)) fx('sfx', { n: 'cableReel', p: m.pos }, false)
    } else if (a.kind === 'ring') {
      const before = c.charge
      c.charge = Math.min(1, c.charge + dt / MINI.chargeTime)
      if (before === 0) fx('sfx', { n: 'charge', p: m.pos })
      if (c.charge >= 1 && before < 1 && m.kind === 'local') rumble(0.5, 0.5, 120)
    }

    // Rope constraint (inextensible, slack allowed).
    tmp.copy(a.pos).sub(m.pos)
    const dist = tmp.length()
    if (dist > c.len) {
      tmp.divideScalar(dist)
      const radial = v.dot(tmp)
      if (radial < 0) v.addScaledVector(tmp, -radial)
      v.addScaledVector(tmp, (dist - c.len) * 12)
      if (m.grounded && a.pos.y > m.pos.y + 0.3 && dist - c.len > 0.02) { m.grounded = false }
    }
    if (!m.grounded) {
      // Gravity was applied above; rope keeps us on the sphere.
      v.multiplyScalar(1 - 0.05 * dt)
    }
  }
}

/** Spring launch: predictable arc up-and-over the anchor, toward the stick. */
function springLaunch(m: Mini, a: Anchor, inp: StepInput) {
  const c = m.cable
  tmp.copy(a.pos).sub(m.pos).normalize()
  facing(m, fwd)
  if (inp.move.lengthSq() > 0.05) fwd.copy(inp.move).normalize()
  target.copy(tmp).multiplyScalar(0.35).addScaledVector(UP, 1).addScaledVector(fwd, 0.6).normalize()
  const speed = MINI.launchMin + (MINI.launchMax - MINI.launchMin) * c.charge
  v.copy(target).multiplyScalar(speed)
  c.state = 'retract'
  c.anchorId = null
  c.charge = 0
  c.reeling = false
  m.launchedT = 0.55
  m.jumpT = G.time
  m.grounded = false
  fx('sfx', { n: 'spring', p: m.pos })
  fx('particles', { n: 'burst', p: m.pos, c: m.slot === 0 ? '#5ef0ff' : '#ffb347' })
  if (m.kind === 'local') rumble(0.6, 0.6, 140)
}

/** Tap on an anchor: a short pull toward it with a little lift. */
function yank(m: Mini, to: Vector3) {
  tmp.copy(to).sub(m.pos)
  const d = tmp.length()
  if (d < 1e-3) return
  tmp.divideScalar(d)
  const k = Math.min(1, d / MINI.cableRange)
  v.addScaledVector(tmp, MINI.yankSpeed * k)
  v.y = Math.max(v.y, 0) + 3.2 * k
  m.launchedT = 0.3
  m.jumpT = G.time
  m.grounded = false
  fx('sfx', { n: 'whoosh', p: m.pos })
}

function detach(m: Mini, upBoost: number) {
  const c = m.cable
  c.state = 'retract'
  c.anchorId = null
  c.charge = 0
  c.reeling = false
  if (!m.grounded && upBoost > 0) {
    // Swing release keeps (and slightly boosts) the arc's momentum.
    v.x *= 1.2
    v.z *= 1.2
    v.y = Math.max(v.y, 0) + upBoost
    m.jumpT = G.time
    m.launchedT = 0.25
  }
  fx('sfx', { n: 'release', p: m.pos })
}

export function punchPartner(partner: Mini, dir: Vector3, force: number) {
  const msg = { slot: partner.slot, d: [dir.x, dir.y, dir.z], f: force }
  if (partner.kind === 'remote') G.session?.send('hit', msg)
  else applyHit(partner, msg)
}

export function applyHit(m: Mini, msg: { d: number[]; f: number }) {
  if (m.protectT > 0 || m.dead || m.hidden || !m.body) return
  const lv = m.body.linvel()
  m.body.setLinvel({ x: lv.x + msg.d[0] * msg.f, y: Math.max(lv.y, 0) + 3.2 + msg.f * 0.25, z: lv.z + msg.d[2] * msg.f }, true)
  m.stunT = 0.35
  m.protectT = MINI.knockProtect
  m.launchedT = 0.4
  m.jumpT = G.time
  if (m.hangOn >= 0) m.hangOn = -1
  if (m.kind === 'local') rumble(0.8, 0.5, 160)
}

export function nearestBox(m: Mini): string | null {
  let best: string | null = null
  let bd = MINI.boxRange + (settings().assist ? 0.4 : 0)
  facing(m, fwd)
  for (const nb of G.bodies.values()) {
    if (!nb.id.startsWith('box') || nb.heldBy >= 0) continue
    const p = nb.body.translation()
    tmp.set(p.x - m.pos.x, p.y - m.pos.y, p.z - m.pos.z)
    const d = tmp.length()
    if (d < bd && Math.abs(tmp.y) < 1.1 && tmp.setY(0).normalize().dot(fwd) > -0.2) { bd = d; best = nb.id }
  }
  return best
}

function nearGrabbable(m: Mini, partner: Mini) {
  // Don't turn a box pickup / glove grab / partner grab into a hand offer.
  if (partner.offering && m.pos.distanceTo(partner.glove) < MINI.gloveRange + 0.3) return true
  return !!nearestBox(m) || canTow(m, partner)
}

/** Fist jab at the best punch target (or a whiff straight ahead). */
function punch(world: World, m: Mini, partner: Mini) {
  const c = m.cable
  const pk = pickPunchTarget(world, m, partner)
  handPos(m, tmp2)
  m.punchT = G.time
  c.state = 'flying'
  c.punch = true
  c.t = G.time
  c.charge = 0
  c.tip.copy(tmp2)
  if (pk.kind === 'none') {
    facing(m, fwd)
    c.anchorId = null
    c.hit = false
    c.target.copy(tmp2).addScaledVector(fwd, 1.5)
  } else {
    // Turn to face what we punch: the robot always aims for the player.
    m.yaw = Math.atan2(pk.point.x - m.pos.x, pk.point.z - m.pos.z)
    c.hit = true
    c.anchorId = pk.kind === 'robot' ? `robot:${partner.slot}` : pk.anchor!.id
    c.target.copy(pk.point)
  }
  fx('sfx', { n: 'whoosh', p: m.pos, v: 0.7 })
}

/** Partner close enough, on about the same level, and free to be grabbed. */
export function canTow(m: Mini, partner: Mini) {
  if (partner.hidden || partner.dead || partner.hangOn >= 0 || partner.towing || !m.grounded) return false
  tmp.copy(partner.pos).sub(m.pos)
  return Math.abs(tmp.y) < 0.7 && Math.hypot(tmp.x, tmp.z) < MINI.towReach
}
