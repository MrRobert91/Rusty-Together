// Virtual clock injected before the page loads (Playwright addInitScript).
// The game then advances only when the driver calls __vclock.advance(ms), so a
// slow software-rendered browser can still play and record at a perfect 30/60 fps.
(() => {
  let vt = 0
  const t0 = Date.now()
  const raf = new Map()
  let rafId = 1
  const timers = new Map()
  let timerId = 1
  const realSetTimeout = window.setTimeout.bind(window)
  performance.now = () => vt
  Date.now = () => t0 + vt
  window.requestAnimationFrame = (cb) => { const id = rafId++; raf.set(id, cb); return id }
  window.cancelAnimationFrame = (id) => { raf.delete(id) }
  window.setTimeout = (cb, ms = 0, ...a) => {
    const id = timerId++
    timers.set(id, { at: vt + Math.max(0, +ms || 0), cb: typeof cb === 'function' ? cb : () => eval(cb), a, every: 0 })
    return id
  }
  window.clearTimeout = (id) => { timers.delete(id) }
  window.setInterval = (cb, ms = 0, ...a) => {
    const id = timerId++
    const every = Math.max(1, +ms || 0)
    timers.set(id, { at: vt + every, cb, a, every })
    return id
  }
  window.clearInterval = (id) => { timers.delete(id) }
  function runTimers() {
    for (let guard = 0; guard < 1000; guard++) {
      let best = null
      for (const [id, t] of timers) if (t.at <= vt && (!best || t.at < best[1].at)) best = [id, t]
      if (!best) return
      const [id, t] = best
      if (t.every) t.at += t.every
      else timers.delete(id)
      try { t.cb(...t.a) } catch (e) { console.error(e) }
    }
  }
  function frame() {
    runTimers()
    const list = [...raf.entries()]
    raf.clear()
    for (const [, cb] of list) { try { cb(vt) } catch (e) { console.error(e) } }
  }
  let running = false
  window.__vclock = {
    now: () => vt,
    /** Advance virtual time by `ms` in frames of `frame` ms (one render each). */
    advance(ms, frameMs = ms) {
      const n = Math.max(1, Math.round(ms / frameMs))
      for (let i = 0; i < n; i++) { vt += ms / n; frame() }
      return vt
    },
    /** Free-run (real time) in frames of `frameMs` virtual ms until stop(). */
    run(frameMs = 50) {
      running = true
      const tick = () => { if (!running) return; vt += frameMs; frame(); realSetTimeout(tick, 0) }
      tick()
    },
    stop() { running = false },
  }
})()
