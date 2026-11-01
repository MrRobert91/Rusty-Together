// Scripted run through «Taller de pruebas» (solo, with Ámbar-bot).
// Every step uses player inputs only; the bot partner is the game's own AI.
(() => {
  const G = window.__G
  const B = window.__bot
  const me = () => B.me()
  const amber = () => G.minis[1]
  const feet = () => me().pos.y - 0.5
  const step = () => G.vars.tstep
  const plan = []
  const S = (name, run, extra = {}) => plan.push({ name, run, ...extra })

  // Optional fun first: kick the ball into the goal once, grab the mushroom nut.
  S('kick ball', (b, t) => {
    const ball = G.bodies.get('ball:t').body.translation()
    // Get behind the ball (on the +x side) and punch it toward the goal (-x).
    const bx = ball.x + 1.1, bz = ball.z
    if (!b._kicked) {
      if (b.goto(bx, bz, 0.3)) {
        me().yaw = -Math.PI / 2
        b.tap('punch')
        b._kicked = t
      }
      return false
    }
    if ((G.vars['goals:t'] ?? 0) > 0) return true
    if (t - b._kicked > 2.5) b._kicked = 0
    return false
  }, { clip: 't_kick', tail: 2.2, timeout: 30 })
  S('mushroom nut', (b, t) => {
    if (G.vars['nut:tn1']) return b.goto(2.0, -9.6, 0.5) && me().grounded
    return b.bounceOn(4.2, -10.8) && false
  }, { timeout: 20 })
  S('walk to edge', (b) => { b.look(0, 0.3); return b.goto(0, -12.6, 0.3) && step() === 'jump' })
  S('jump gap', (b, t) => {
    b.look(0, 0.3)
    b.stickTo(0.25, -1)
    if (me().pos.z < -13.0 && me().grounded && !b._j) { b.hold('jump'); b._j = 1 }
    if (b._j && !me().grounded && me().vel.y < 0) b.release('jump')
    return step() === 'high'
  })
  S('high step', (b) => {
    b.look(0, 0.3)
    b.stickTo(0, -1)
    if (me().pos.z < -20.8 && me().grounded) b.hold('jump')
    return step() === 'box'
  })
  S('take box', (b) => {
    const c = G.bodies.get('box-t').body.translation()
    if (me().carrying) return true
    if (b.goto(c.x, c.z + 0.9, 0.25)) { me().yaw = Math.PI; b.tap('grab') }
    return false
  })
  S('box on switch', (b, t) => {
    if (G.vars['sw:t_box']) return true
    if (!me().carrying) {
      // Dropped beside the switch: pick it up again.
      const c = G.bodies.get('box-t').body.translation()
      if (t % 1 < 1 / 60) b.note('box at ' + [c.x, c.y, c.z].map((v) => v.toFixed(2)) + ' me ' + [me().pos.x, me().pos.z].map((v) => v.toFixed(2)))
      if (b.goto(c.x, c.z + 0.9, 0.25)) { me().yaw = Math.PI; b.tap('grab') }
      return false
    }
    if (b.goto(-1.0, -29.4, 0.3)) { me().yaw = -Math.PI / 2; b.tap('grab'); const c = G.bodies.get('box-t').body.translation(); b.note('drop at ' + [me().pos.x, me().pos.z, c.x, c.y, c.z].map((v) => v.toFixed(2))) }
    return false
  })
  S('through door', (b) => {
    b.look(0, 0.3)
    // Walk around the box so we don't kick it off the switch.
    if (me().pos.z > -30.4 && !b._wp) { if (b.goto(1.8, -30.6, 0.4)) b._wp = 1; return false }
    return b.goto(0.5, -35, 0.4) && step() === 'punch'
  })
  S('punch gate', (b) => {
    if (b.goto(-1.6, -36.2, 0.25)) { me().yaw = -Math.PI / 2; b.tap('punch') }
    return step() === 'swing'
  })
  S('swing', (b, t) => {
    const m = me()
    if (m.cable.state === 'idle' && m.grounded) {
      b.look(0, 0.3)
      if (m.pos.z < -39.3 && m.pos.z > -39.95 && Math.abs(m.pos.x) < 0.4) { b.stop(); b.hold('context') }
      else { b.release('context'); b.goto(0, -39.6, 0.2) }
    } else if (m.cable.state === 'attached') {
      b.stickTo(0, -1)
      if (m.pos.z < -43.2 && m.vel.z < 0) b.release('context')
    } else b.stickTo(0, -1)
    return step() === 'spring'
  }, { timeout: 60 })
  S('nut over gap', (b) => true)
  S('spring up the cliff', (b, t) => {
    const m = me()
    if (m.cable.state === 'idle' && m.grounded && feet() < 3) {
      b.look(0, 0.15)
      if (b.goto(0, -52.6, 0.2)) { b.hold('context') }
      else b.release('context')
    } else if (m.cable.state === 'attached') {
      b.stickTo(0, -1, 0.6)
      if (m.cable.charge >= 1) b.release('context')
    } else { b.stickTo(0, -1) }
    return step() === 'meet'
  }, { timeout: 60 })
  S('cliff nut', (b) => {
    if (G.vars['nut:tn4']) return b.goto(-1.5, -60, 0.5) && me().grounded
    return b.bounceOn(-4.2, -63.5) && false
  }, { timeout: 25 })
  S('wake Ámbar', (b) => {
    const a = amber().pos
    if (b.goto(a.x - 1.3, a.z, 0.3)) { me().yaw = Math.PI / 2; b.tap('punch') }
    return step() === 'boost'
  })
  S('springboard', (b, t) => {
    const a = amber().pos
    const m = me()
    if (!b._go) {
      // Wait for Ámbar to reach its base at the wall foot.
      if (Math.hypot(a.x - 1.0, a.z + 67.4) > 0.6 || !amber().grounded) { b.goto(1.0, -63.8, 0.3); return false }
      if (b.goto(1.0, -64.6, 0.2)) { b._go = 1 }
      return false
    }
    b.look(0, 0.3)
    if (Math.floor(t * 4) !== Math.floor((t - 1 / 60) * 4)) b.note(`sb p=${[m.pos.x, m.pos.y, m.pos.z].map((v) => v.toFixed(2))} v=${[m.vel.x, m.vel.y, m.vel.z].map((v) => v.toFixed(1))} g=${m.grounded} cling=${m.cling} held=${[...b.held]}`)
    if (m.grounded && feet() > 5.8 && feet() < 6.3) {
      // Standing on Ámbar's head: jump from there (springboard).
      b.release('jump'); b.hold('jump'); b.stickTo(0, -1)
    } else if (m.grounded && feet() < 6) {
      b.goto(a.x, a.z, 0.05)
      if (Math.hypot(a.x - m.pos.x, a.z - m.pos.z) < 1.5) b.hold('jump')
    } else {
      b.stickTo(0, -1)
      if (m.vel.y < -1 && feet() < 6) b.release('jump')
    }
    if (feet() < 4.6 && m.grounded && t > 3) b._go = 0
    return step() === 'hand'
  }, { clip: 't_spring', clipAfter: 1.5, tail: 1.0, timeout: 60 })
  S('offer hand', (b, t) => {
    if (b.goto(0.2, -69.05, 0.18)) { me().yaw = 0; b.hold('grab') }
    return step() === 'cross'
  }, { timeout: 60 })
  S('wait for Ámbar to cross', (b) => { b.goto(0.5, -79, 0.4); return step() === 'catch' }, { timeout: 40 })
  S('catch the hand', (b, t) => {
    const m = me()
    if (m.hangOn >= 0) { b.hold('grab'); return false }
    const g = amber().glove
    b.faceTo(g.x, g.z, 0.3)
    if (m.grounded) {
      b.release('grab')
      b.stickTo(g.x - m.pos.x, -1)
      if (m.pos.z < -80.9) b.hold('jump')
    } else {
      b.stickTo(g.x - m.pos.x, -1)
      b.hold('grab')
      if (m.cable.state === 'idle' && m.pos.distanceTo(g) < 3.8) b.tap('context')
    }
    return step() === 'couple'
  }, { timeout: 60 })
  S('couple', (b) => {
    if (b.goto(0.9, -91.4, 0.4)) b.hold('context')
    return G.form === 'joined'
  }, { clip: 't_merge', clipAfter: 1.0, tail: 2.0, timeout: 40 })
  S('walk joined', (b) => { b.look(0, 0.36); b.stickTo(0, -1); return step() === 'hop' }, { timeout: 30 })
  S('hop', (b) => {
    b.stickTo(0, -1)
    if (G.big.grounded && G.big.pos.z < -96.3 && G.big.pos.z > -97.5) b.tap('jump')
    return step() === 'joint'
  }, { timeout: 30 })
  S('joint jump', (b) => {
    b.stickTo(0, -1)
    if (G.big.grounded && G.big.pos.z < -102.9 && G.big.pos.z > -104) b.tap('jump')
    return step() === 'sling'
  }, { clip: 't_joint', tail: 1.0, timeout: 30 })
  S('slingshot', (b, t) => {
    const B = G.big
    if (!b._a) { if (b.goto(0, -111.6, 0.3)) b._a = 1; return false }
    b.stop()
    G.cam.pitch = 0.36
    b.hold('context')
    if (B.tension > 0.97) b.release('context')
    return step() === 'split'
  }, { timeout: 40 })
  S('split', (b) => { if (b.goto(0, -126, 0.6)) b.hold('context'); return G.form === 'split' && step() === 'done' }, { timeout: 40 })
  S('high five', (b, t) => {
    if (G.stats && b._five) return true
    const a = amber()
    if (a.emote === 1 && G.time - a.emoteT < 2.6) {
      if (b.goto(a.pos.x, a.pos.z + 1.2, 1.2)) { me().yaw = Math.PI; b.tap('punch'); b._five = 1 }
    } else if (t > 3 && !b._raised) { b.tap('emote1'); b._raised = 1 }
    return false
  }, { clip: 't_five', tail: 1.8, timeout: 15 })
  S('finish nut', (b) => {
    if (G.vars['nut:tn5']) return b.goto(1.5, -127, 0.5) && me().grounded
    return b.bounceOn(4.4, -125.2) && false
  }, { timeout: 25 })
  S('finish arch', (b) => { b.goto(0, -131.5, 0.4); return !!window.__levelDone }, { timeout: 30 })
  B.run(plan)
})()
