// Plays a level to the end screen with a scripted bot in virtual time.
// usage: node playtest.cjs tutorial plan-tutorial.js
const fs = require('fs')
const path = require('path')
const { launch, until } = require('./lib.cjs')
const level = process.argv[2] || 'tutorial'
const planFile = process.argv[3] || `plan-${level}.js`
const LIMIT = +(process.env.LIMIT || 900) // virtual seconds
;(async () => {
  const { browser, page } = await launch({ url: `${process.env.URL || "http://localhost:5174/"}?solo&level=${level}&nooverlay`, quality: 'low', width: 640, height: 360 })
  await until(page, () => window.__G && __G.minis[0].body && __gl, { timeout: 60, frame: 100 })
  await page.evaluate(() => __vclock.advance(1500, 50))
  if (!process.env.RENDER) await page.evaluate(() => { window.__realRender = __gl.render.bind(__gl); __gl.render = () => {} })
  await page.evaluate(() => { const s = __G.fx.get('levelDone') ?? (__G.fx.set('levelDone', new Set()), __G.fx.get('levelDone')); s.add(() => { window.__levelDone = true }) })
  await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, 'botlib.js'), 'utf8') })
  await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, planFile), 'utf8') })
  let seen = 0
  const t0 = Date.now()
  for (;;) {
    const st = await page.evaluate(() => { __vclock.advance(1000, 1000 / 60); return { log: __bot.log, done: __bot.done, fail: __bot.fail, t: __G.time, ld: !!window.__levelDone, sync: __G.vars.sync, nuts: __G.vars.nuts } })
    for (; seen < st.log.length; seen++) console.log(st.log[seen])
    if (st.done || st.fail || st.t > LIMIT) {
      console.log(st.fail ? 'FAIL: ' + st.fail : st.done ? 'DONE' : 'LIMIT', '| levelDone:', st.ld, '| sync:', JSON.stringify(st.sync), '| nuts:', st.nuts, '| wall', Math.round((Date.now() - t0) / 1000), 's')
      const info = await page.evaluate(() => { const m = __G.minis[0]; const a = __G.minis[1]; return { me: [m.pos.x, m.pos.y, m.pos.z].map((v) => v.toFixed(2)), meGround: m.grounded, cable: m.cable.state, hang: m.hangOn, amber: [a.pos.x, a.pos.y, a.pos.z].map((v) => v.toFixed(2)), form: __G.form, step: __G.vars.tstep, big: [__G.big.pos.x, __G.big.pos.y, __G.big.pos.z].map((v) => v.toFixed(2)) } })
      console.log(JSON.stringify(info))
      if (!process.env.RENDER) await page.evaluate(() => { __gl.render = window.__realRender })
      if (process.env.CAM === 'am') await page.evaluate(() => { const a = __G.minis[1].pos; window.__freeCam = { p: [a.x + 2.5, a.y + 3, a.z + 4], t: [a.x, a.y, a.z] } })
      await page.evaluate(() => __vclock.advance(100, 33))
      await page.screenshot({ path: `/tmp/claude-0/shots/playtest-${level}.png`, timeout: 120000 })
      break
    }
  }
  await browser.close()
  process.exit(0)
})()
