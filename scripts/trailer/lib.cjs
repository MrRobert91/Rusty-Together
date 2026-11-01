// Shared Playwright helpers for the trailer / playtest drivers.
const path = require('path')
const { chromium } = require(path.resolve(__dirname, '../../node_modules/playwright'))

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'

async function launch({ width = 960, height = 540, quality = 'low', url }) {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  })
  const page = await browser.newPage({ viewport: { width, height } })
  page.on('console', (m) => { if (m.type() === 'error' || process.env.VERBOSE) console.log('[page]', m.type(), m.text().slice(0, 300)) })
  page.on('pageerror', (e) => console.log('[pageerror]', e.message))
  await page.addInitScript((q) => {
    localStorage.setItem('rusty-together-settings', JSON.stringify({ state: { quality: q, playerName: 'Cian', masterVolume: 0 }, version: 3 }))
  }, quality)
  await page.addInitScript({ path: path.join(__dirname, 'vclock.js') })
  await page.goto(url)
  return { browser, page }
}

/** Advance virtual time until `cond` (a page function returning truthy) or timeout (virtual s). */
async function until(page, cond, { timeout = 30, frame = 50, arg } = {}) {
  const t0 = await page.evaluate(() => __vclock.now())
  for (;;) {
    const r = await page.evaluate(([c, a, f]) => { __vclock.advance(f * 4, f); return (0, eval)(c)(a) }, [cond.toString(), arg, frame])
    if (r) return r
    const now = await page.evaluate(() => __vclock.now())
    if (now - t0 > timeout * 1000) throw new Error('timeout waiting for ' + cond.toString().slice(0, 120))
  }
}

module.exports = { launch, until }
