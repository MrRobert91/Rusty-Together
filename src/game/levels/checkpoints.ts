import * as THREE from 'three'
import { G, type Checkpoint } from '../runtime'
import { hostSet, onVar } from '../net/replication'
import { fx } from '../runtime'
import { sfx } from '../../core/audio'
import { toast } from '../hud'

type V3 = [number, number, number]

export interface CpDef extends Checkpoint { order: number; killY: number }
export const cps = new Map<string, CpDef>()

export function defineCheckpoints(list: Array<{ id: string; room: number; a: V3; b: V3; yaw: number; joined?: V3; killY?: number }>) {
  cps.clear()
  list.forEach((c, i) => {
    cps.set(c.id, {
      id: c.id, room: c.room, order: i, yaw: c.yaw, killY: c.killY ?? -16,
      spawns: [new THREE.Vector3(...c.a), new THREE.Vector3(...c.b)],
      joined: c.joined ? { pos: new THREE.Vector3(...c.joined), yaw: c.yaw } : undefined,
    })
  })
}

/** Host: advance the checkpoint (never backwards). */
export function reachCheckpoint(id: string, quiet = false) {
  const next = cps.get(id)
  const cur = G.checkpoint ? cps.get(G.checkpoint.id) : null
  if (!next || (cur && cur.order >= next.order)) return
  hostSet('cp', id)
  if (!quiet) fx('checkpoint', {})
}

export function bindCheckpoints() {
  const off = onVar('cp', (id: string) => {
    const c = cps.get(id)
    if (!c) return
    const first = !G.checkpoint
    G.checkpoint = c
    G.killY = c.killY
    if (!first) {
      sfx('checkpoint')
      toast('Punto de control guardado', 'good', 1800)
    }
  })
  return off
}
