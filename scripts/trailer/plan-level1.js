// Scripted co-op run through «Muelles de rebote» in one browser: Cian is
// driven with player inputs, Ámbar through the AI hook as a second player.
(() => {
  const G = window.__G
  const B = window.__bot
  const P = window.__P
  P.install()
  const me = () => B.me()
  const am = () => G.minis[1]
  const feet = (m) => m.pos.y - 0.5
  const V = (x, y, z) => me().pos.clone().set(x, y, z)
  const plan = []
  const S = (name, run, extra = {}) => plan.push({ name, run, ...extra })
  const room = () => G.checkpoint?.id
  const trace = (b, t, tag) => { if (Math.floor(t * 2) !== Math.floor((t - 1 / 60) * 2)) b.note(`${tag} me=${[me().pos.x, me().pos.y, me().pos.z].map((v) => v.toFixed(2))} g=${me().grounded} am=${[am().pos.x, am().pos.y, am().pos.z].map((v) => v.toFixed(2))} g=${am().grounded} hang=${am().hangOn}/${me().hangOn} form=${G.form} carry=${me().carrying}/${am().carrying} held=${G.bodies.get("boxR")?.heldBy}`) }

  /* ---------------- Title shot: both robots, a high five, slow orbit ---------------- */
  S('title', (b, t) => {
    const k = Math.min(1, t / 6)
    const ang = 0.9 - k * 1.3
    const r = 7.2 - k * 2.2
    window.__freeCam = { p: [Math.sin(ang) * r, 2.6 - k * 0.8, -1.2 + Math.cos(ang) * r], t: [0, 1.1, -1.4] }
    if (t < 1.2) { b.goto(-0.55, -1.2, 0.1); P.goto(0.55, -1.2, 0.1) }
    else { b.stop(); P.stop(); me().yaw = Math.PI / 2; am().yaw = -Math.PI / 2 }
    if (t > 1.6 && !b._up) { b._up = 1; b.tap('emote1'); P.tap('emote1') }
    if (t > 6) { delete window.__freeCam; return true }
    return false
  }, { clip: 'title', tail: 0, timeout: 12 })

  /* ---------------- Room 1: springboard + offered hand ---------------- */
  S('kick-about', (b, t) => {
    // A quick goal while waiting (optional fun).
    const ball = G.bodies.get('ball:l1').body.translation()
    if ((G.vars['goals:l1'] ?? 0) > 0) return true
    if (!b._k && b.goto(ball.x - 1.1, ball.z, 0.3)) { me().yaw = Math.PI / 2; b.tap('punch'); b._k = t }
    if (b._k && t - b._k > 2.5) b._k = 0
    return false
  }, { timeout: 25, optional: true })
  S('Ámbar to the wall', (b) => {
    const a = P.goto(0.5, -11.0, 0.25)
    const m = b.goto(0.5, -7.4, 0.3)
    return a && m && am().grounded
  })
  S('springboard onto the wall', (b, t) => {
    trace(b, t, 'sb')
    const m = me()
    b.look(0, 0.3)
    if (m.grounded && feet(m) < 1.6 && feet(m) > -0.2) {
      b.goto(am().pos.x, am().pos.z, 0.05)
      if (Math.hypot(am().pos.x - m.pos.x, am().pos.z - m.pos.z) < 1.5) b.hold('jump')
    } else if (m.grounded && feet(m) > 0.6 && feet(m) < 1.4) {
      b.release('jump')
    } else {
      b.stickTo(0, -1)
      if (m.vel.y < -1) b.release('jump')
    }
    return feet(m) > 2 && m.grounded && m.pos.z < -12.3
  }, { clip: 'l1_spring', timeout: 30 })
  S('offer hand, Ámbar climbs', (b, t) => {
    trace(b, t, 'hand')
    const a = am()
    if (b.goto(0.5, -12.4, 0.15)) { me().yaw = 0; b.hold('grab') }
    if (a.hangOn >= 0) { P.stop(); P.hold('grab'); return false }
    if (!me().offering) { P.goto(0.5, -11.0, 0.3); return false }
    const g = me().glove
    if (a.grounded && feet(a) < 1) {
      P.release('grab')
      if (P.goto(g.x, g.z + 0.15, 0.2)) P.hold('jump')
    } else if (!a.grounded) {
      P.hold('grab')
      if (a.vel.y < 0) P.release('jump')
    }
    return room() === 'c1b' || (feet(a) > 2 && a.grounded && a.pos.z < -12.2)
  }, { clip: 'l1_hand', clipMax: 4, tail: 1.5, timeout: 40 })
  S('Ámbar to the gap edge', (b) => {
    P.releaseAll()
    b.releaseAll?.()
    const ok = P.goto(0.4, -21.2, 0.25)
    const okm = b.goto(0.4, -17.6, 0.3)
    return ok && okm && am().grounded && me().grounded
  })
  S('springboard to the high ring', (b, t) => {
    trace(b, t, 'ring')
    const m = me()
    b.look(0, 0.1)
    P.goto(0.4, -21.2, 0.25)
    if (m.cable.state === 'attached') {
      b.stickTo(0, -1)
      if (m.pos.z < -24.6 && m.vel.z < 0) b.release('context')
      return false
    }
    if (m.cable.state !== 'idle') { b.stickTo(0, -1); return false }
    if (m.grounded && feet(m) < 2.9) {
      if (m.pos.z < -25.7) return true
      b.release('context')
      b.goto(am().pos.x, am().pos.z, 0.05)
      if (Math.hypot(am().pos.x - m.pos.x, am().pos.z - m.pos.z) < 1.5) b.hold('jump')
      return false
    }
    // In the air above Ámbar: hook the ring as soon as it lights up.
    b.stickTo(0, -0.25, 0.3)
    if (m.vel.y < 1 && feet(m) > 4) { b.release('jump'); b.hold('context') }
    return false
  }, { clip: 'l1_ring', tail: 1.5, timeout: 40 })
  S('land across', (b) => { b.release('context'); return me().grounded && b.goto(0.3, -27.2, 0.4) })
  S('hand across the gap', (b, t) => {
    trace(b, t, 'gap')
    const a = am()
    if (b.goto(0.3, -25.95, 0.15)) { me().yaw = 0; b.hold('grab') }
    if (a.hangOn >= 0) { P.stop(); P.hold('grab'); return false }
    if (!me().offering) return false
    const g = me().glove
    P.aim = g.clone().sub(a.pos).normalize()
    if (a.grounded && a.pos.z > -21.4 && feet(a) > 2) {
      P.release('grab')
      P.dir(g.x - a.pos.x, -1)
      if (a.pos.z < -21.0) P.hold('jump')
    } else if (!a.grounded) {
      P.dir(g.x - a.pos.x, -1)
      P.hold('grab')
      if (a.cable.state === 'idle' && a.pos.distanceTo(g) < 3.8) P.tap('context')
    } else if (a.grounded && feet(a) > 2 && a.pos.z < -25.6) return true
    else P.goto(0.4, -19.8, 0.3)
    return room() === 'c1c'
  }, { timeout: 60 })

  /* ---------------- Room 2: crossed conveyors ---------------- */
  S('take the boxes', (b) => {
    P.releaseAll(); P.aim = null
    b.release('grab')
    const bl = G.bodies.get('boxL').body.translation()
    const br = G.bodies.get('boxR').body.translation()
    if (!me().carrying && b.goto(bl.x, bl.z + 0.9, 0.25)) { me().yaw = Math.PI; b.tap('grab') }
    if (!am().carrying && P.goto(br.x, br.z + 0.9, 0.25)) { am().yaw = Math.PI; P.tap('grab') }
    return !!me().carrying && !!am().carrying
  }, { timeout: 30 })
  S('Ámbar holds the relay switch, Cian delivers', (b, t) => {
    trace(b, t, 'belt')
    P.goto(3, -39.2, 0.15)
    const m = me()
    if (m.carrying) {
      if (b.goto(-3, -48.0, 0.3)) { m.yaw = Math.PI; b.tap('grab') }
      return false
    }
    return !!G.vars['sw:sockL']
  }, { clip: 'l1_belt', clipAfter: 2.5, clipMax: 3.5, tail: 0.5, timeout: 60 })
  S('Cian holds the other switch, Ámbar delivers', (b, t) => {
    trace(b, t, 'belt2')
    b.goto(-3, -45.3, 0.15)
    const a = am()
    if (a.carrying && Math.hypot(me().pos.x + 3, me().pos.z + 45.3) < 0.6) {
      if (P.goto(3, -48.0, 0.3)) { a.yaw = Math.PI; P.tap('grab') }
    }
    return !!G.vars['sw:sockR']
  }, { timeout: 60 })
  S('through the doors', (b) => {
    const ok1 = b.goto(-2.5, -55, 0.6)
    const ok2 = P.goto(2.5, -55, 0.6)
    return ok1 && ok2 && room() === 'c2'
  }, { timeout: 40 })

  /* ---------------- Room 4: first body ---------------- */
  S('to the plate', (b) => {
    const ok1 = b.goto(-1.0, -74, 0.4)
    const ok2 = P.goto(1.0, -74, 0.4)
    if (ok1 && ok2) { b.hold('context'); P.hold('context') }
    return G.form === 'joined'
  }, { clip: 'l1_merge', clipAfter: 4.5, tail: 2.0, timeout: 60 })
  S('walk joined', (b) => {
    b.releaseAll?.(); b.release('context'); P.releaseAll()
    P.syncJump = false
    b.look(0, 0.36)
    return b.goto(0, -91.0, 0.4)
  }, { timeout: 40 })
  S('unilateral hop', (b) => {
    b.stickTo(0, -1)
    if (G.big.grounded && G.big.pos.z < -91.4 && G.big.pos.z > -92.2 && !b._h) { b.tap('jump'); b._h = 1 }
    return G.big.grounded && G.big.pos.z < -93.6 && G.big.pos.z > -97.8
  }, { timeout: 20 })
  S('joint jumps', (b) => {
    P.syncJump = true
    b.stickTo(0, -1)
    const z = G.big.pos.z
    if (G.big.grounded && ((z < -97.4 && z > -98.2) || (z < -105.4 && z > -106.2))) b.tap('jump')
    return room() === 'c5'
  }, { clip: 'l1_joint', clipAfter: 1.5, tail: 0.5, timeout: 40 })

  /* ---------------- Room 5: crane monkey bars + slingshot ---------------- */
  const arm = (i) => G.big.arms[i].cable
  const shoulder = (i) => { const Bb = G.big; const lx = i === 0 ? 0.62 : -0.62; return V(Bb.pos.x + lx * Math.cos(Bb.yaw), Bb.pos.y + 0.55, Bb.pos.z - lx * Math.sin(Bb.yaw)) }
  const ringPos = (id) => G.anchors.get(id).pos
  const aimRight = (id) => { P.pilotAim = ringPos(id).clone().sub(shoulder(1)).normalize() }
  const btrace = (b, t, tag) => { if (Math.floor(t * 2) !== Math.floor((t - 1 / 60) * 2)) b.note(`${tag} big=${[G.big.pos.x, G.big.pos.y, G.big.pos.z].map((v) => v.toFixed(2))} g=${G.big.grounded} arms=${arm(0).state}:${arm(0).anchorId}/${arm(1).state}:${arm(1).anchorId} T=${G.big.tension.toFixed(2)}`) }
  S('across the seesaw', (b, t) => {
    btrace(b, t, 'see')
    P.syncArms = false
    P.pilotReel = false
    return b.goto(0, -135.4, 0.4) && G.big.grounded
  }, { timeout: 40 })
  S('monkey bars', (b, t) => {
    btrace(b, t, 'bars')
    const Bb = G.big
    const L = arm(0), R = arm(1)
    // Walk to the edge, then hang still while the arms alternate; pump only on the last ring.
    if (b._ph === 1 && Bb.grounded) b.stickTo(0, -1); else if (b._ph >= 4) b.stickTo(0, -1, 1); else b.stop()
    if (!b._ph) b._ph = 1
    if (b._ph === 1) {
      // Left arm on the first ring.
      b.press('context', L.state !== 'idle')
      if (L.state === 'attached') { if (L.anchorId === 'r5_m1') b._ph = 2; else { b.release('context') } }
    } else if (b._ph === 2) {
      if (Bb.pos.z < -137.5 && R.state === 'idle' && t - (b._rt ?? -9) > 0.3) { b._rt = t; aimRight('r5_m2'); P.xs++; P.pilotReel = true }
      if (R.state === 'attached' && R.anchorId === 'r5_m2') { b.release('context'); b._ph = 3 }
    } else if (b._ph === 3) {
      if (Bb.pos.z < -142.5) b.press('context', L.state !== 'idle')
      if (L.state === 'attached' && L.anchorId === 'r5_m3') { P.pilotReel = false; b._ph = 4 }
      else if (L.state === 'attached' && L.anchorId !== 'r5_m3') b.release('context')
    } else if (b._ph === 4) {
      if (Bb.pos.z < -151.4 && Bb.vel.z < 0 && Bb.vel.y < 4) { b.release('context'); b._ph = 5 }
    }
    if (Bb.dead) { b._ph = 0; P.pilotReel = false }
    return Bb.grounded && Bb.pos.z < -153.3 && Bb.pos.y > 3.6
  }, { clip: 'l1_bars', clipMax: 7.5, tail: 1.0, timeout: 60 })
  S('slingshot', (b, t) => {
    btrace(b, t, 'sling')
    const Bb = G.big
    const L = arm(0), R = arm(1)
    const sig = `${L.state}/${R.state} held=${[...b.held]} preel=${P.pilotReel}`
    if (sig !== b._sig) { b._sig = sig; b.note('  ' + sig + ' T=' + Bb.tension.toFixed(2) + ' y=' + Bb.pos.y.toFixed(1)) }
    if (!b._at) { if (b.goto(0, -156.2, 0.3) && Bb.grounded) b._at = 1; return false }
    b.stop()
    if (b._fired) { b.releaseAll(); P.pilotReel = false; if (Bb.grounded && t - b._fired > 0.5 && Bb.pos.z > -165) b._fired = 0; return Bb.grounded && Bb.pos.z < -166 }
    if (Bb.tension <= 0.97) b.press('context', L.state !== 'idle')
    if (L.state === 'attached' && L.anchorId !== 'r5_slW') b.release('context')
    if (R.state === 'idle' && !b._rf) { aimRight('r5_slE'); P.xs++; P.pilotReel = true; b._rf = 1 }
    if (R.state === 'idle' && b._rf && t > 1) b._rf = 0
    if (Bb.tension > 0.97) { b.release('context'); P.pilotReel = false; b._fired = t }
    return Bb.grounded && Bb.pos.z < -166
  }, { clip: 'l1_sling', tail: 1.5, timeout: 40 })

  /* ---------------- Room 6: the sorting crab ---------------- */
  S('split for the latches', (b) => {
    P.syncArms = true; P.pilotReel = null; P.pilotAim = null
    if (b.goto(0, -170.5, 0.6)) b.hold('context')
    return G.form === 'split'
  }, { timeout: 30 })
  S('drag both latches', (b, t) => {
    trace(b, t, 'latch')
    const sig = `${me().cable.state}:${me().cable.anchorId}/${am().cable.state}:${am().cable.anchorId} LW=${G.vars.latchW} LE=${G.vars.latchE} bW=${G.vars.beltW} bE=${G.vars.beltE} crab=${G.vars.crab}`
    if (sig !== b._sig) { b._sig = sig; b.note('  ' + sig) }
    const lw = G.anchors.get('latchW'), le = G.anchors.get('latchE')
    const m = me(), a = am()
    // Cian: west latch.
    if (!G.vars.calibW && (G.vars.beltW ?? -1) < 0) {
      if (m.cable.state === 'attached' || m.cable.state === 'flying') { b.stop(); b.hold('context') }
      else if (b.goto(-6.6, -173.4, 0.35)) { b.faceTo(lw.pos.x, lw.pos.z, -0.1); b.press('context', false) }
      else b.release('context')
    } else { b.release('context'); b.goto(-1.2, -173, 0.4) }
    // Ámbar: east latch.
    if (!G.vars.calibE && (G.vars.beltE ?? -1) < 0) {
      P.aim = le.pos.clone().sub(a.pos).normalize()
      if (a.cable.state === 'attached' || a.cable.state === 'flying') { P.stop(); P.hold('context') }
      else if (P.goto(6.6, -173.4, 0.35)) { a.yaw = Math.atan2(le.pos.x - a.pos.x, le.pos.z - a.pos.z); if (P.held.has('context')) P.release('context'); else P.hold('context') }
      else P.release('context')
    } else { P.release('context'); P.aim = null; P.goto(1.2, -173, 0.4) }
    return !!G.vars.crabOpen
  }, { clip: 'l1_latch', clipAfter: 1.5, clipMax: 4.5, tail: 1.0, timeout: 90 })
  S('couple on the arena plate', (b) => {
    P.aim = null
    const ok1 = b.goto(-1.0, -175.5, 0.4)
    const ok2 = P.goto(1.0, -175.5, 0.4)
    if (ok1 && ok2) { b.hold('context'); P.hold('context') }
    return G.form === 'joined'
  }, { timeout: 40 })
  S('grip the handles', (b, t) => {
    btrace(b, t, 'grip')
    b.release('context'); P.releaseAll()
    P.syncMove = true; P.pilotMove = null; P.pilotGrab = null
    const Bb = G.big
    if (Bb.pos.z > -179.4) { b.goto(0, -179.6, 0.2); return false }
    b.stop()
    b.hold('grab')
    return !!Bb.arms[0].grip && !!Bb.arms[1].grip
  }, { timeout: 30 })
  S('pry: one anchors, the other pulls, then swap', (b, t) => {
    btrace(b, t, 'pry')
    if (Math.floor(t * 2) !== Math.floor((t - 1 / 60) * 2)) b.note(`  pry=${G.vars.pry} hint=${G.vars.pryHint} grips=${G.big.arms[0].grip}/${G.big.arms[1].grip} anch=${G.big.legs[0].anchored}/${G.big.legs[1].anchored} push=${G.big.legs[0].push.toFixed(2)}/${G.big.legs[1].push.toFixed(2)} crab=${G.vars.crab}`)
    b.hold('grab')
    const pry = G.vars.pry ?? 0
    const pullBack = V(0, 0, 1)
    if (pry < 1) { b.stop(); P.syncMove = false; P.pilotMove = pullBack }
    else { b.stickTo(0, 1); P.pilotMove = V(0, 0, 0) }
    return G.vars.fuse === 'carried'
  }, { clip: 'l1_pry', clipMax: 3, tail: 0.3, timeout: 40 })
  S('fuse to the socket', (b, t) => {
    btrace(b, t, 'fuse')
    P.pilotMove = null; P.syncMove = true
    b.hold('grab')
    const Bb = G.big
    if (G.vars.fuse === 'dropped') {
      const fp = G.vars.fuseP
      b.release('grab')
      if (b.goto(fp[0], fp[2] + 1.2, 0.3)) b.hold('grab')
      return false
    }
    // Head for the dais, joint-jump up onto it.
    const tx = -7, tz = -185.5
    const onDais = Bb.pos.y > 5.5
    if (!onDais) {
      b.goto(tx + 2.6, tz + 1.8, 0.3)
      if (Bb.grounded && Math.hypot(Bb.pos.x - (tx + 2.6), Bb.pos.z - (tz + 1.8)) < 1.2) b.tap('jump')
    } else b.goto(tx, tz, 0.3)
    return G.vars.fuse === 'inserted'
  }, { clip: 'l1_fuse', tail: 0.3, timeout: 60 })
  S('level complete', (b) => { b.stop(); return !!window.__levelDone }, { clip: 'l1_rank', tail: 6.5, timeout: 20 })

  B.run(plan)
  B.releaseAll = () => { for (const k of [...B.held]) B.release(k) }
})()
