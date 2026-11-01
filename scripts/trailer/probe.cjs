const { launch, until } = require('./lib.cjs')
;(async () => {
  const { browser, page } = await launch({ url: 'http://localhost:5173/?solo&level=tutorial&nooverlay' })
  await until(page, () => window.__G && __G.minis[0].body, { timeout: 60, frame: 100 })
  for (const f of [16.67, 50, 100, 200]) {
    const t = Date.now()
    await page.evaluate((f) => __vclock.advance(f * 10, f), f)
    console.log('frame', f, 'ms → wall per frame', (Date.now() - t) / 10)
  }
  await page.screenshot({ path: '/tmp/claude-0/shots/probe.png' })
  console.log(await page.evaluate(() => JSON.stringify(__G.minis[0].pos)))
  await browser.close()
})()
