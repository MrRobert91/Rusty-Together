import * as THREE from 'three'

export type Expression = 'normal' | 'blink' | 'happy' | 'surprised' | 'determined' | 'sad' | 'dizzy' | 'love' | 'squint' | 'talk'

/** Draws the visor face on a canvas: the robot's whole personality lives here. */
export class VisorFace {
  canvas = document.createElement('canvas')
  tex: THREE.CanvasTexture
  private last = ''
  constructor(public colors: [string, string]) {
    this.canvas.width = 256
    this.canvas.height = 128
    this.tex = new THREE.CanvasTexture(this.canvas)
    this.tex.colorSpace = THREE.SRGBColorSpace
    this.draw('normal', 0, 0)
  }

  draw(expr: Expression, lookX: number, lookY: number, talk = 0) {
    const key = `${expr}|${lookX.toFixed(1)}|${lookY.toFixed(1)}|${talk.toFixed(1)}`
    if (key === this.last) return
    this.last = key
    const g = this.canvas.getContext('2d')!
    g.clearRect(0, 0, 256, 128)
    g.fillStyle = '#05080e'
    g.fillRect(0, 0, 256, 128)
    // scanlines
    g.fillStyle = 'rgba(255,255,255,0.025)'
    for (let y = 0; y < 128; y += 4) g.fillRect(0, y, 256, 1)
    const ox = lookX * 14
    const oy = -lookY * 8
    for (let i = 0; i < 2; i++) {
      const cx = (i === 0 ? 82 : 174) + ox
      const cy = 62 + oy
      const col = this.colors[i]
      g.shadowColor = col
      g.shadowBlur = 18
      g.fillStyle = col
      g.strokeStyle = col
      g.lineCap = 'round'
      g.lineWidth = 12
      const mirror = i === 0 ? 1 : -1
      switch (expr) {
        case 'blink':
          g.beginPath(); g.moveTo(cx - 18, cy + 4); g.lineTo(cx + 18, cy + 4); g.stroke(); break
        case 'happy':
          g.beginPath(); g.arc(cx, cy + 12, 20, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); break
        case 'surprised':
          g.beginPath(); g.arc(cx, cy, 22, 0, Math.PI * 2); g.lineWidth = 9; g.stroke(); break
        case 'determined':
          g.beginPath(); g.moveTo(cx - 18 * mirror, cy - 14); g.lineTo(cx + 14 * mirror, cy + 2); g.lineTo(cx - 18 * mirror, cy + 16); g.stroke(); break
        case 'sad':
          roundRect(g, cx - 15, cy - 10, 30, 34, 12); g.fill()
          g.fillStyle = '#05080e'; g.shadowBlur = 0
          g.beginPath(); g.moveTo(cx - 24, cy - 16); g.lineTo(cx + 24, cy - 16 + 14 * mirror); g.lineTo(cx + 24, cy - 30); g.lineTo(cx - 24, cy - 30); g.fill(); break
        case 'dizzy':
          g.lineWidth = 7; g.beginPath()
          for (let a = 0; a < Math.PI * 4; a += 0.2) { const r = a * 2.6; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r) }
          g.stroke(); break
        case 'love':
          heart(g, cx, cy, 22); break
        case 'squint':
          roundRect(g, cx - 18, cy - 4, 36, 14, 7); g.fill(); break
        default: {
          const h = 40 + talk * 6
          roundRect(g, cx - 15, cy - h / 2, 30, h, 14); g.fill()
          g.fillStyle = 'rgba(255,255,255,0.85)'; g.shadowBlur = 0
          roundRect(g, cx - 7, cy - h / 2 + 6, 9, 12, 4); g.fill()
        }
      }
    }
    if (talk > 0.05) {
      g.shadowBlur = 10
      g.shadowColor = this.colors[0]
      g.fillStyle = this.colors[0]
      const w = 18 + talk * 26
      roundRect(g, 128 - w / 2 + ox, 104 + oy * 0.4, w, 6 + talk * 6, 4); g.fill()
    }
    this.tex.needsUpdate = true
  }
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

function heart(g: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  g.beginPath()
  g.moveTo(cx, cy + s * 0.9)
  g.bezierCurveTo(cx - s * 1.6, cy - s * 0.1, cx - s * 0.7, cy - s * 1.3, cx, cy - s * 0.45)
  g.bezierCurveTo(cx + s * 0.7, cy - s * 1.3, cx + s * 1.6, cy - s * 0.1, cx, cy + s * 0.9)
  g.fill()
}
