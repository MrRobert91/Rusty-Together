// Page-side helpers for scripted play (injected after load). They drive the
// game through the same inputs a player uses: the touch stick/buttons hooks
// (__touch) and the camera yaw/pitch. Everything runs once per physics step.
(() => {
  const G = window.__G
  const T = window.__touch
  const bot = (window.__bot = {
    plan: [],
    i: 0,
    t: 0,
    stepT: 0,
    log: [],
    held: new Set(),
    done: false,
    fail: null,
    note(msg) { bot.log.push(`[${G.time.toFixed(1)}] ${msg}`) },
    me() { return G.minis[G.session.localSlot] },
    /** World XZ direction → stick (camera-relative). */
    stickTo(dx, dz, mag = 1) {
      const y = G.cam.yaw
      const s = Math.sin(y), c = Math.cos(y)
      const n = Math.hypot(dx, dz) || 1
      dx /= n; dz /= n
      T.move.x = (dx * c - dz * s) * mag
      T.move.y = (-dx * s - dz * c) * mag
    },
    stop() { T.move.x = 0; T.move.y = 0 },
    /** Walk toward (x, z); true when within tol. */
    goto(x, z, tol = 0.35, mag = 1) {
      const p = G.form === 'joined' ? G.big.pos : bot.me().pos
      const dx = x - p.x, dz = z - p.z
      const d = Math.hypot(dx, dz)
      if (d < tol) { bot.stop(); return true }
      bot.stickTo(dx, dz, Math.min(mag, Math.max(0.7, d / 1.2)))
      return false
    },
    /** Hop onto a bouncy mushroom at (x, z) and keep bouncing on it. */
    bounceOn(x, z) {
      const m = bot.me()
      const dx = x - m.pos.x, dz = z - m.pos.z
      const d = Math.hypot(dx, dz)
      bot.stickTo(dx, dz, d > 1.6 ? 1 : Math.min(1, d / 0.8))
      if (m.grounded && d < 1.7) bot.hold('jump')
      if (!m.grounded && m.vel.y < 0) bot.release('jump')
      return false
    },
    hold(b) { if (!bot.held.has(b)) { T.held.add(b); T.tapped.add(b); bot.held.add(b) } },
    release(b) { T.held.delete(b); bot.held.delete(b) },
    tap(b) { T.tapped.add(b) },
    /** Keep a button held, re-pressing it every few frames until `ok`. */
    press(b, ok) {
      if (ok) { bot.hold(b); return }
      bot._pulse = (bot._pulse ?? 0) + 1
      if (bot._pulse % 8 === 0) bot.release(b); else bot.hold(b)
    },
    /** Point the camera so its forward looks along yaw (0 = -Z) with pitch. */
    look(yawFwd, pitch) { G.cam.yaw = yawFwd; if (pitch !== undefined) G.cam.pitch = pitch },
    faceTo(x, z, pitch) {
      const p = bot.me().pos
      // camera forward = -(sin yaw, cos yaw)
      G.cam.yaw = Math.atan2(-(x - p.x), -(z - p.z))
      if (pitch !== undefined) G.cam.pitch = pitch
    },
    run(plan) { bot.plan = plan; bot.i = 0; bot.stepT = 0; bot.t = 0; bot.done = false; bot.fail = null; bot.note('plan start: ' + plan.map((s) => s.name).join(', ')) },
    tick() {
      if (bot.done || bot.fail || !bot.plan.length) return
      const dt = 1 / 60
      bot.t += dt
      bot.stepT += dt
      const s = bot.plan[bot.i]
      if (!s) {
        if (bot.rec && G.time > bot.recUntil) { bot.note('■ stop ' + bot.rec); bot.rec = null }
        bot.done = !bot.rec
        return
      }
      if (s.enter && !s._entered) { s._entered = true; s.enter(bot) }
      // Trailer capture: steps tagged with `clip` are recorded (plus a tail).
      if (s.clip && window.__clipFilter && !window.__clipFilter.includes(s.clip)) s._clipped = true
      if (s.clip && bot.rec !== s.clip && bot.stepT >= (s.clipAfter ?? 0) && !s._clipped) { s._clipped = true; bot.rec = s.clip; bot.recUntil = Infinity; bot.recStart = G.time; bot.note('● rec ' + s.clip) }
      if (s.clip && bot.rec === s.clip && s.clipMax && G.time - bot.recStart > s.clipMax) { bot.recUntil = G.time }
      if (bot.rec && bot.recUntil !== Infinity && G.time > bot.recUntil) { bot.note('■ stop ' + bot.rec); bot.rec = null }
      let r = false
      try { r = s.run(bot, bot.stepT) } catch (e) { bot.fail = `${s.name}: ${e.message}`; return }
      if (r) {
        if (s.clip && bot.rec === s.clip && bot.recUntil === Infinity) bot.recUntil = G.time + (s.tail ?? 1.2)
        bot.note(`✓ ${s.name} (${bot.stepT.toFixed(1)} s)`)
        bot.stop()
        for (const b of [...bot.held]) bot.release(b)
        bot.i++
        bot.stepT = 0
        if (bot.i >= bot.plan.length) bot.done = !bot.rec
      } else if (bot.stepT > (s.timeout ?? 40)) {
        if (s.optional) {
          bot.note(`~ skipped optional ${s.name}`)
          bot.stop()
          for (const b of [...bot.held]) bot.release(b)
          bot.i++
          bot.stepT = 0
        } else bot.fail = `timeout in ${s.name}`
      }
    },
  })
  const prev = window.__onStep
  window.__onStep = () => { prev?.(); bot.tick() }
})()

// Second player (Ámbar, slot 1) driven through the AI hook with the same
// inputs a human sends: a stick, held/tapped buttons and an aim.
;(() => {
  const G = window.__G
  const THREE_V = () => G.minis[1].pos.clone().set(0, 0, 0)
  const P = (window.__P = {
    mx: 0, mz: 0,
    held: new Set(), tapped: new Set(), prev: new Set(),
    aim: null,
    // Joined body: what the right pilot does.
    syncJump: true, syncArms: true, syncMove: true,
    pilotAim: null, pilotReel: null, pilotGrab: null, pilotMove: null,
    xs: 0, xr: 0, jumps: 0, ps: 0,
    me() { return G.minis[1] },
    stop() { P.mx = 0; P.mz = 0 },
    goto(x, z, tol = 0.35, mag = 1) {
      const p = P.me().pos
      const dx = x - p.x, dz = z - p.z
      const d = Math.hypot(dx, dz)
      if (d < tol) { P.stop(); return true }
      const k = Math.min(mag, Math.max(0.7, d / 1.2)) / d
      P.mx = dx * k; P.mz = dz * k
      return false
    },
    dir(dx, dz, mag = 1) { const n = Math.hypot(dx, dz) || 1; P.mx = (dx / n) * mag; P.mz = (dz / n) * mag },
    hold(b) { if (!P.held.has(b)) { P.held.add(b); P.tapped.add(b) } },
    release(b) { P.held.delete(b) },
    tap(b) { P.tapped.add(b) },
    releaseAll() { P.held.clear() },
  })
  void THREE_V
  // Only plans that drive Ámbar themselves install this (the tutorial keeps Ámbar-bot's AI).
  P.install = () => { window.__aiDriver.mini = miniDriver; window.__aiDriver.pilot = pilotDriver }
  const miniDriver = (inp) => {
    const m = P.me()
    inp.move.set(P.mx, 0, P.mz)
    for (const b of Object.keys(inp.held)) {
      const h = P.held.has(b) || P.tapped.has(b)
      inp.pressed[b] = h && !P.prev.has(b)
      inp.released[b] = !h && P.prev.has(b)
      inp.held[b] = h
      if (h) P.prev.add(b); else P.prev.delete(b)
    }
    P.tapped.clear()
    if (P.aim) inp.aim.copy(P.aim)
    else inp.aim.set(Math.sin(m.yaw), 0.3, Math.cos(m.yaw)).normalize()
  }
  const pilotDriver = (rp, lp) => {
    const now = G.time
    if (P.pilotMove) rp.move.copy(P.pilotMove)
    else if (!P.syncMove) rp.move.set(0, 0, 0)
    if (P.pilotAim) rp.aim.copy(P.pilotAim)
    if (P.pilotReel !== null) rp.reel = P.pilotReel
    else if (!P.syncArms) rp.reel = false
    if (P.pilotGrab !== null) rp.grab = P.pilotGrab
    if (P.syncJump) for (const j of lp.jumps) rp.jumps.push(j)
    if (P.syncArms) { for (const x of lp.xs) rp.xs.push(x); for (const x of lp.xr) rp.xr.push(x) }
    for (; P.jumps > 0; P.jumps--) rp.jumps.push(now)
    for (; P.xs > 0; P.xs--) rp.xs.push(now)
    for (; P.xr > 0; P.xr--) rp.xr.push(now)
    for (; P.ps > 0; P.ps--) rp.ps.push(now)
  }
})()
