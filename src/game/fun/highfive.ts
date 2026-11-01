import * as THREE from 'three'
import { G, fx, type Mini } from '../runtime'
import { spark } from './sync'

/** How long a raised hand (emote 1, «¡Choca!») waits for the partner's palm. */
export const FIVE_WINDOW = 2.6

let lastFive = -9

/**
 * High five: punching a partner who holds a hand up (or both raising a hand
 * next to each other) claps palms instead of shoving. Called on the client
 * that detected it; the clap is mirrored and the spark goes to the host.
 */
export function highFive(by: Mini, to: Mini) {
  if (G.time - lastFive < 0.8) return
  lastFive = G.time
  const p = new THREE.Vector3().addVectors(by.pos, to.pos).multiplyScalar(0.5)
  p.y = Math.max(by.pos.y, to.pos.y) + 0.75
  fx('highfive', { a: by.slot, b: to.slot, p: [p.x, p.y, p.z] })
  spark('five', p)
}

export function resetHighFive() { lastFive = -9 }
