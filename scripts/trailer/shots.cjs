// Quick look: teleport the local robot to a few spots and screenshot.
const { launch, until } = require('./lib.cjs')
const spots = JSON.parse(process.argv[3] || '[]')
;(async () => {
  const { browser, page } = await launch({ url: `http://localhost:5173/?solo&level=${process.argv[2] || 'tutorial'}&nooverlay`, width: 1280, height: 720, quality: process.env.Q || 'high' })
  await until(page, () => window.__G && __G.minis[0].body, { timeout: 60, frame: 100 })
  await page.evaluate(() => __vclock.advance(3000, 50))
  let i = 0
  for (const s of spots) {
    await page.evaluate((s) => {
      const m = __G.minis[0]
      m.body.setTranslation({ x: s.p[0], y: s.p[1], z: s.p[2] }, true)
      if (s.b) __G.minis[1].body.setTranslation({ x: s.b[0], y: s.b[1], z: s.b[2] }, true)
      __G.cam.yaw = s.yaw ?? 0
      __G.cam.pitch = s.pitch ?? 0.3
    }, s)
    await page.evaluate((ms) => __vclock.advance(ms, 33), s.wait ?? 1500)
    if (s.js) await page.evaluate(s.js)
    if (s.after) await page.evaluate((ms) => __vclock.advance(ms, 33), s.after)
    { const t = Date.now(); await page.screenshot({ path: `/tmp/claude-0/shots/look${i++}.png`, timeout: 180000 }); console.log('shot ms', Date.now() - t) }
  }
  await browser.close()
})()
