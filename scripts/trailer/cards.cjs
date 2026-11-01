// Renders the trailer's text cards to transparent PNGs.
const path = require('path')
const { chromium } = require(path.resolve(__dirname, '../../node_modules/playwright'))
const out = process.argv[2] || '/tmp/trailer-cards'
const ids = ['title', 'end', ...Array.from({ length: 12 }, (_, i) => `c${i + 1}`)]
;(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome' })
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } })
  require('fs').mkdirSync(out, { recursive: true })
  for (const id of ids) {
    await p.goto('file://' + path.join(__dirname, 'cards.html') + '?card=' + id)
    await p.evaluate(() => document.fonts.ready)
    await p.waitForTimeout(300)
    await p.screenshot({ path: path.join(out, id + '.png'), omitBackground: true })
  }
  await b.close()
})()
