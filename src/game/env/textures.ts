import * as THREE from 'three'

/** Procedural canvas textures: no image assets needed, crisp at any size. */

const cache = new Map<string, THREE.Texture>()
function memo(key: string, make: () => THREE.Texture) {
  let t = cache.get(key)
  if (!t) { t = make(); cache.set(key, t) }
  return t
}

function canvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = true) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 8
  return t
}

let seed = 1337
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }

/** Layered red-rock strata, like the canyon in the concept art. */
export const strataTex = () => memo('strata', () => canvas(256, 256, (g) => {
  const bands = ['#b8583a', '#c96a43', '#a24a33', '#d07b4f', '#9a4430', '#c3623d', '#b55236', '#d88a5c']
  let y = 0
  while (y < 256) {
    const h = 6 + rnd() * 26
    g.fillStyle = bands[Math.floor(rnd() * bands.length)]
    g.fillRect(0, y, 256, h)
    y += h
  }
  // Cracks and blocky erosion.
  for (let i = 0; i < 70; i++) {
    g.fillStyle = `rgba(60,25,15,${0.08 + rnd() * 0.15})`
    const x = rnd() * 256
    g.fillRect(x, rnd() * 256, 1 + rnd() * 2, 6 + rnd() * 30)
  }
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(255,220,180,${rnd() * 0.08})`
    g.fillRect(rnd() * 256, rnd() * 256, 2 + rnd() * 6, 1 + rnd() * 3)
  }
  for (let i = 0; i < 18; i++) {
    g.fillStyle = `rgba(70,30,20,${0.15 + rnd() * 0.1})`
    g.fillRect(0, rnd() * 256, 256, 1)
  }
}))

export const grassTex = () => memo('grass', () => canvas(128, 128, (g) => {
  g.fillStyle = '#7fa83a'
  g.fillRect(0, 0, 128, 128)
  for (let i = 0; i < 1400; i++) {
    const c = ['#8cb843', '#6f9a33', '#9cc552', '#78a33a', '#a8cf5e'][Math.floor(rnd() * 5)]
    g.fillStyle = c
    g.fillRect(rnd() * 128, rnd() * 128, 1 + rnd() * 2, 2 + rnd() * 4)
  }
}))

export const metalTex = () => memo('metal', () => canvas(128, 128, (g) => {
  g.fillStyle = '#6d7480'
  g.fillRect(0, 0, 128, 128)
  for (let i = 0; i < 600; i++) {
    g.fillStyle = `rgba(255,255,255,${rnd() * 0.05})`
    g.fillRect(rnd() * 128, rnd() * 128, 1 + rnd() * 3, 1)
  }
  g.strokeStyle = 'rgba(30,32,38,0.6)'
  g.lineWidth = 2
  g.strokeRect(1, 1, 126, 126)
  g.fillStyle = 'rgba(30,32,38,0.7)'
  for (const [x, y] of [[8, 8], [120, 8], [8, 120], [120, 120], [64, 8], [64, 120]]) { g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill() }
}))

/** Diamond plate for walkways. */
export const plateTex = () => memo('plate', () => canvas(64, 64, (g) => {
  g.fillStyle = '#8a8f98'
  g.fillRect(0, 0, 64, 64)
  g.fillStyle = 'rgba(255,255,255,0.18)'
  for (let y = 0; y < 64; y += 16) for (let x = (y / 16) % 2 ? 8 : 0; x < 64; x += 16) {
    g.save(); g.translate(x + 4, y + 4); g.rotate(Math.PI / 4); g.fillRect(-1.5, -5, 3, 10); g.restore()
  }
  g.fillStyle = 'rgba(0,0,0,0.15)'
  for (let y = 0; y < 64; y += 16) for (let x = (y / 16) % 2 ? 8 : 0; x < 64; x += 16) {
    g.save(); g.translate(x + 5, y + 5); g.rotate(Math.PI / 4); g.fillRect(-1.5, -5, 3, 10); g.restore()
  }
}))

export const hazardTex = () => memo('hazard', () => canvas(64, 64, (g) => {
  g.fillStyle = '#ffc21a'
  g.fillRect(0, 0, 64, 64)
  g.fillStyle = '#1f2026'
  for (let i = -64; i < 128; i += 22) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 11, 0); g.lineTo(i + 11 - 64, 64); g.lineTo(i - 64, 64); g.fill()
  }
}))

export const woodTex = () => memo('wood', () => canvas(128, 128, (g) => {
  g.fillStyle = '#b07a46'
  g.fillRect(0, 0, 128, 128)
  for (let y = 0; y < 128; y += 32) {
    g.fillStyle = `rgba(80,45,20,0.5)`
    g.fillRect(0, y, 128, 2)
    for (let i = 0; i < 30; i++) {
      g.fillStyle = `rgba(90,50,25,${rnd() * 0.25})`
      g.fillRect(rnd() * 128, y + 3 + rnd() * 26, 10 + rnd() * 50, 1)
    }
  }
  g.fillStyle = '#3a3d45'
  for (let y = 0; y < 128; y += 32) for (const x of [6, 122]) { g.beginPath(); g.arc(x, y + 16, 2.5, 0, Math.PI * 2); g.fill() }
}))

export const beltTex = () => memo('belt', () => canvas(64, 64, (g) => {
  g.fillStyle = '#2a2c32'
  g.fillRect(0, 0, 64, 64)
  g.fillStyle = '#3a3d45'
  for (let y = 0; y < 64; y += 8) g.fillRect(0, y, 64, 4)
  g.fillStyle = '#ffc21a'
  g.beginPath(); g.moveTo(22, 40); g.lineTo(32, 24); g.lineTo(42, 40); g.lineTo(37, 40); g.lineTo(32, 32); g.lineTo(27, 40); g.fill()
}))

export const padTex = () => memo('pad', () => canvas(128, 128, (g) => {
  g.fillStyle = '#e8572e'
  g.fillRect(0, 0, 128, 128)
  g.fillStyle = '#ff7a45'
  for (let y = 0; y < 128; y += 32) for (let x = 0; x < 128; x += 32) { g.beginPath(); g.arc(x + 16, y + 16, 10, 0, Math.PI * 2); g.fill() }
}))

/** A signboard with text, used for room names and hints in the world. */
export function signTex(text: string, sub = '', bg = '#2d3340', fg = '#ffffff', accent = '#ffc21a') {
  return memo(`sign:${text}|${sub}|${bg}`, () => canvas(512, 256, (g) => {
    g.fillStyle = bg
    g.fillRect(0, 0, 512, 256)
    g.fillStyle = accent
    g.fillRect(0, 0, 512, 14)
    g.fillRect(0, 242, 512, 14)
    g.fillStyle = fg
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.font = '800 64px Fredoka, "Baloo 2", system-ui, sans-serif'
    g.fillText(text, 256, sub ? 108 : 128)
    if (sub) {
      g.font = '600 34px Fredoka, system-ui, sans-serif'
      g.fillStyle = 'rgba(255,255,255,0.8)'
      g.fillText(sub, 256, 178)
    }
  }, false))
}

/** Soft radial puff for clouds and blob shadows. */
export const puffTex = () => memo('cloudpuff', () => canvas(128, 128, (g) => {
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grd.addColorStop(0, 'rgba(255,255,255,1)')
  grd.addColorStop(0.5, 'rgba(255,255,255,0.75)')
  grd.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 128, 128)
}, false))

export const iconTex = (glyph: string, color: string) => memo(`icon:${glyph}${color}`, () => canvas(128, 128, (g) => {
  g.fillStyle = color
  g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill()
  g.fillStyle = '#ffffff'
  g.textAlign = 'center'; g.textBaseline = 'middle'
  g.font = '800 72px Fredoka, system-ui, sans-serif'
  g.fillText(glyph, 64, 70)
}, false))
