import * as THREE from 'three'
import { COLORS } from '../tuning'

/** Shared, cached materials and geometries so three robots cost almost nothing. */

const cache = new Map<string, THREE.Material>()

function std(key: string, params: THREE.MeshStandardMaterialParameters) {
  let m = cache.get(key)
  if (!m) { m = new THREE.MeshStandardMaterial(params); cache.set(key, m) }
  return m as THREE.MeshStandardMaterial
}

// Subtle wear: a tiny procedural roughness/colour noise texture shared by armour.
let wear: THREE.Texture | null = null
function wearTex() {
  if (wear) return wear
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, 128, 128)
  for (let i = 0; i < 900; i++) {
    const a = Math.random() * 0.09
    g.fillStyle = `rgba(90,70,50,${a})`
    const s = Math.random() * 3 + 0.5
    g.fillRect(Math.random() * 128, Math.random() * 128, s, s)
  }
  for (let i = 0; i < 14; i++) {
    g.strokeStyle = `rgba(80,60,40,${0.06 + Math.random() * 0.08})`
    g.lineWidth = Math.random() * 1.5 + 0.3
    g.beginPath()
    const x = Math.random() * 128, y = Math.random() * 128
    g.moveTo(x, y)
    g.lineTo(x + (Math.random() - 0.5) * 30, y + (Math.random() - 0.5) * 30)
    g.stroke()
  }
  wear = new THREE.CanvasTexture(c)
  wear.wrapS = wear.wrapT = THREE.RepeatWrapping
  wear.colorSpace = THREE.SRGBColorSpace
  return wear
}

export const M = {
  ivory: () => std('ivory', { color: COLORS.ivory, roughness: 0.48, metalness: 0.05, map: wearTex() }),
  ivoryShade: () => std('ivoryShade', { color: COLORS.ivoryShade, roughness: 0.55, metalness: 0.05 }),
  joint: () => std('joint', { color: COLORS.joint, roughness: 0.45, metalness: 0.6 }),
  dark: () => std('dark', { color: '#26282e', roughness: 0.6, metalness: 0.3 }),
  sole: () => std('sole', { color: COLORS.sole, roughness: 0.9, metalness: 0 }),
  visor: () => std('visor', { color: COLORS.visor, roughness: 0.15, metalness: 0.4 }),
  chrome: () => std('chrome', { color: '#c9ccd2', roughness: 0.25, metalness: 0.9 }),
  accent: (hex: string) => std('accent' + hex, { color: hex, roughness: 0.42, metalness: 0.12, map: wearTex() }),
  glow: (hex: string, intensity = 2.2) => std('glow' + hex + intensity, { color: hex, emissive: hex, emissiveIntensity: intensity, roughness: 0.4, toneMapped: false }),
  /** Soft dark disc used as a cheap contact shadow when real shadows are off. */
  blob: () => {
    let m = cache.get('blob')
    if (!m) {
      const c = document.createElement('canvas')
      c.width = c.height = 64
      const g = c.getContext('2d')!
      const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32)
      grd.addColorStop(0, 'rgba(0,0,0,0.55)')
      grd.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = grd
      g.fillRect(0, 0, 64, 64)
      m = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false })
      cache.set('blob', m)
    }
    return m as THREE.MeshBasicMaterial
  },
  /** Shared vertex-coloured robot material used by merged rig meshes. */
  rigVC: () => std('rigVC', { color: '#ffffff', vertexColors: true, roughness: 0.48, metalness: 0.18, map: wearTex() }),
  basic: (hex: string, opacity = 1) => {
    const key = 'basic' + hex + opacity
    let m = cache.get(key)
    if (!m) { m = new THREE.MeshBasicMaterial({ color: hex, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, toneMapped: false }); cache.set(key, m) }
    return m as THREE.MeshBasicMaterial
  },
}

const gcache = new Map<string, THREE.BufferGeometry>()
function geo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = gcache.get(key)
  if (!g) { g = make(); gcache.set(key, g) }
  return g as T
}

export const GEO = {
  sphere: () => geo('sphere', () => new THREE.SphereGeometry(1, 32, 24)),
  sphereLo: () => geo('sphereLo', () => new THREE.SphereGeometry(1, 16, 12)),
  capsule: () => geo('capsule', () => new THREE.CapsuleGeometry(0.5, 1, 6, 14)),
  cyl: () => geo('cyl', () => new THREE.CylinderGeometry(1, 1, 1, 20)),
  box: () => geo('box', () => new THREE.BoxGeometry(1, 1, 1)),
  torus: () => geo('torus', () => new THREE.TorusGeometry(1, 0.12, 12, 40)),
  ringFlat: () => geo('ringFlat', () => new THREE.RingGeometry(0.85, 1, 48)),
  cone: () => geo('cone', () => new THREE.ConeGeometry(1, 1, 16)),
  rbox: (w: number, h: number, d: number, r: number) =>
    geo(`rbox${w}_${h}_${d}_${r}`, () => roundedBox(w, h, d, r, 4)),
}

/** Rounded box geometry (same idea as drei's RoundedBox) for crisp bevels. */
export function roundedBox(width: number, height: number, depth: number, radius: number, smoothness: number) {
  const shape = new THREE.Shape()
  const eps = 0.00001
  const r = radius - eps
  shape.absarc(eps, eps, eps, -Math.PI / 2, -Math.PI, true)
  shape.absarc(eps, height - r * 2, eps, Math.PI, Math.PI / 2, true)
  shape.absarc(width - r * 2, height - r * 2, eps, Math.PI / 2, 0, true)
  shape.absarc(width - r * 2, eps, eps, 0, -Math.PI / 2, true)
  const g = new THREE.ExtrudeGeometry(shape, { depth: depth - radius * 2, bevelEnabled: true, bevelSegments: smoothness * 2, steps: 1, bevelSize: r, bevelThickness: radius, curveSegments: smoothness })
  g.center()
  g.computeVertexNormals()
  return g
}
