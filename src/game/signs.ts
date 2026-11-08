import * as THREE from 'three'

/** Signs in the level: walking up to one «reads» it into the info bubble. */
export interface SignInfo { id: number; pos: THREE.Vector3; text: string; sub: string }

export const signs = new Map<number, SignInfo>()
let nextId = 1

export function registerSign(pos: [number, number, number], text: string, sub: string) {
  const s: SignInfo = { id: nextId++, pos: new THREE.Vector3(...pos), text, sub }
  signs.set(s.id, s)
  return () => { signs.delete(s.id) }
}

/** The sign a robot at `p` is reading (close enough, roughly level with it), if any. */
export function signNear(p: THREE.Vector3, range: number, look: THREE.Vector3): SignInfo | null {
  let best: SignInfo | null = null
  let bd = range
  for (const s of signs.values()) {
    const dy = s.pos.y - p.y
    if (dy < -2 || dy > 4.5) continue
    const dx = s.pos.x - p.x, dz = s.pos.z - p.z
    const d = Math.hypot(dx, dz)
    if (d >= bd) continue
    // Reading means looking at it: the camera must face the sign.
    const lf = Math.hypot(look.x, look.z) || 1
    if (d > 0.6 && (dx * look.x + dz * look.z) / (d * lf) < 0.55) continue
    bd = d
    best = s
  }
  return best
}
