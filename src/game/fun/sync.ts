import * as THREE from 'three'
import { G, act, fx, isHost, onAct } from '../runtime'
import { hostSet } from '../net/replication'

/**
 * «Sincronía»: the shared co-op score. Everything you do *together* (springing
 * off a head, catching a hand, joint jumps, high fives, rings in a row…) drops
 * sparks with a comic word and a few points, and chaining them inside a short
 * window raises a shared multiplier (×2 … ×5). The host owns the score; any
 * client can report a spark (the guest sends it as an `act`).
 */

export type SparkKind =
  | 'boing' | 'catch' | 'rescue' | 'five' | 'joint' | 'perfect' | 'hop' | 'ring' | 'nut' | 'bell'
  | 'crab' | 'goal' | 'pad' | 'room' | 'sling' | 'merge' | 'button' | 'parry' | 'kick' | 'swing' | 'fuse' | 'cp'

/** `solo` sparks score at the running multiplier but don't extend the chain. */
interface SparkDef { pts: number; word: string; color: string; big?: boolean; solo?: boolean }

export const SPARKS: Record<SparkKind, SparkDef> = {
  boing: { pts: 30, word: '¡BOING!', color: '#ffe14d' },
  catch: { pts: 40, word: '¡TE TENGO!', color: '#7cf5ff' },
  rescue: { pts: 50, word: '¡ARRIBA!', color: '#8dff9a' },
  five: { pts: 60, word: '¡CHOCA!', color: '#ff7ad9', big: true },
  joint: { pts: 40, word: '¡HOP!', color: '#ffb347' },
  perfect: { pts: 80, word: '¡PERFECTO!', color: '#ff6bf1', big: true },
  hop: { pts: 10, word: '¡TOC!', color: '#ffd27a', solo: true },
  ring: { pts: 20, word: '¡ZAS!', color: '#d59cff' },
  swing: { pts: 25, word: '¡YUJU!', color: '#d59cff' },
  nut: { pts: 100, word: '¡TUERCA!', color: '#ffd23a', big: true },
  bell: { pts: 15, word: '¡DING!', color: '#ffe9a0', solo: true },
  crab: { pts: 60, word: '¡CRAC!', color: '#ff7a5c', big: true },
  goal: { pts: 120, word: '¡GOOOL!', color: '#8dff9a', big: true },
  pad: { pts: 10, word: '¡BOING!', color: '#fff27a', solo: true },
  room: { pts: 150, word: '¡SALA SUPERADA!', color: '#5dff8a', big: true },
  sling: { pts: 100, word: '¡YIIIHA!', color: '#ffcf3a', big: true },
  merge: { pts: 60, word: '¡FUSIÓN!', color: '#9df7ff', big: true },
  button: { pts: 15, word: '¡CLONK!', color: '#ff8a7a', solo: true },
  parry: { pts: 70, word: '¡PARADA!', color: '#ff9a5c', big: true },
  kick: { pts: 5, word: '¡PAM!', color: '#ffffff', solo: true },
  fuse: { pts: 300, word: '¡FUSIBLE!', color: '#ffe14d', big: true },
  cp: { pts: 80, word: '¡GENIAL!', color: '#5dff8a' },
}

export const COMBO_WINDOW = 6
export const MAX_MULT = 5

/** Host-side running state (mirrored to the guest as the `sync` var). */
export const syncState = { score: 0, combo: 0, until: 0, best: 0, sparks: 0 }

export function resetSync() {
  syncState.score = 0
  syncState.combo = 0
  syncState.until = 0
  syncState.best = 0
  syncState.sparks = 0
  lastBy.clear()
}

export const multOf = (combo: number) => Math.max(1, Math.min(MAX_MULT, combo))

/** Repeated sparks of the same kind from the same spot don't farm points. */
const lastBy = new Map<string, number>()
const COOLDOWN: Partial<Record<SparkKind, number>> = { pad: 0.6, kick: 0.5, hop: 0.6, boing: 0.4, bell: 0.2, button: 1.5, catch: 1.2, five: 1.5, ring: 0.3 }

/** Report a spark from any client. */
export function spark(k: SparkKind, p: { x: number; y: number; z: number }, extra?: string) {
  const d = { k, p: [p.x, p.y, p.z], extra }
  if (isHost()) applySpark(d)
  else act('spark', d)
}

function applySpark(d: { k: SparkKind; p: number[]; extra?: string }) {
  const def = SPARKS[d.k]
  if (!def) return
  const t = G.time
  const cd = COOLDOWN[d.k]
  if (cd) {
    const key = d.k
    if (t - (lastBy.get(key) ?? -9) < cd) return
    lastBy.set(key, t)
  }
  const s = syncState
  const live = t < s.until
  if (!def.solo) {
    s.combo = live ? s.combo + 1 : 1
    s.until = t + COMBO_WINDOW
  } else if (!live) s.combo = 0
  s.best = Math.max(s.best, s.combo)
  s.sparks++
  const mult = multOf(t < s.until ? s.combo : 1)
  const pts = def.pts * mult
  s.score += pts
  hostSet('sync', [s.score, s.combo, Math.round(s.until * 100) / 100])
  fx('spark', { k: d.k, p: d.p, pts, mult, extra: d.extra })
}

/** Host: listen for guest-reported sparks. Returns the unsubscribe. */
export function bindSync() {
  return onAct('spark', (_slot, d) => applySpark(d))
}

/** Rank from the final score: thresholds are per level. */
export const RANKS: Record<string, [number, number, number]> = {
  // [S, A, B] — anything below B is C.
  tutorial: [7000, 4800, 2800],
  level1: [11000, 7500, 4200],
  sandbox: [1000, 600, 300],
}

export function rankFor(level: string, score: number): 'S' | 'A' | 'B' | 'C' {
  const r = RANKS[level] ?? RANKS.sandbox
  return score >= r[0] ? 'S' : score >= r[1] ? 'A' : score >= r[2] ? 'B' : 'C'
}

export const V3 = (a: number[]) => new THREE.Vector3(a[0], a[1], a[2])
