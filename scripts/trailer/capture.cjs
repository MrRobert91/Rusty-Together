// Records the trailer clips: plays a level with its bot plan in virtual time,
// rendering and saving 30 fps frames only while a `clip` step runs.
// usage: node capture.cjs level1 plan-level1.js /out/dir
const fs = require('fs')
const path = require('path')
const { launch, until } = require('./lib.cjs')
const level = process.argv[2] || 'level1'
const planFile = process.argv[3] || `plan-${level}.js`
const out = process.argv[4] || '/tmp/trailer-frames'
const W = +(process.env.W || 1280), H = +(process.env.H || 720)
const FPS = 30
;(async () => {
  const { browser, page } = await launch({ url: `${process.env.URL || 'http://localhost:5174/'}?solo&level=${level}&nooverlay&trailer`, quality: process.env.Q || 'high', width: W, height: H })
  await until(page, () => window.__G && __G.minis[0].body && __gl, { timeout: 90, frame: 100 })
  await page.evaluate(() => __vclock.advance(2500, 50))
  // Trailer look: hide the instructional HUD, keep the fun layer.
  await page.addStyleTag({ content: `.objective, .prompts, .portraits, .toasts, .crosshair, .partner-arrow, .click-to-play, .subtitle, .fps, .pilots { display: none !important; } .pops { z-index: 40 }` })
  await page.evaluate(() => { const s = __G.fx.get('levelDone') ?? (__G.fx.set('levelDone', new Set()), __G.fx.get('levelDone')); s.add(() => { window.__levelDone = true }) })
  await page.evaluate(() => { window.__realRender = __gl.render.bind(__gl); window.__setRender = (on) => { __gl.render = on ? window.__realRender : () => {} } })
  await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, 'botlib.js'), 'utf8') })
  await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, planFile), 'utf8') })
  let seen = 0
  const counters = {}
  let rendering = true
  const t0 = Date.now()
  for (;;) {
    const st = await page.evaluate(() => ({ rec: __bot.rec, log: __bot.log, done: __bot.done, fail: __bot.fail, t: __G.time }))
    for (; seen < st.log.length; seen++) console.log(st.log[seen])
    if (st.done || st.fail) { console.log(st.fail ? 'FAIL ' + st.fail : 'DONE', Math.round((Date.now() - t0) / 1000) + ' s wall'); break }
    if (st.rec) {
      if (!rendering) { await page.evaluate(() => { __setRender(true); __vclock.advance(100, 1000 / 60) }); rendering = true }
      await page.evaluate((fps) => {
        __vclock.advance(1000 / fps, 1000 / 60)
        // CSS animations follow the virtual clock too.
        const now = __vclock.now()
        for (const a of document.getAnimations()) {
          if (a.__vt0 === undefined) { a.__vt0 = now; a.pause() }
          a.currentTime = now - a.__vt0
        }
      }, FPS)
      const dir = path.join(out, st.rec)
      fs.mkdirSync(dir, { recursive: true })
      counters[st.rec] = (counters[st.rec] ?? 0) + 1
      await page.screenshot({ path: path.join(dir, String(counters[st.rec]).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 90, timeout: 300000 })
      if (counters[st.rec] % 30 === 0) console.log(`  ${st.rec}: ${counters[st.rec]} frames (${Math.round((Date.now() - t0) / 1000)} s wall)`)
    } else {
      if (rendering) { await page.evaluate(() => __setRender(false)); rendering = false }
      await page.evaluate(() => __vclock.advance(100, 1000 / 60))
    }
  }
  await browser.close()
  process.exit(0)
})()
