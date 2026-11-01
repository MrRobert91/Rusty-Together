import { describe, expect, it, beforeEach } from 'vitest'
import { G } from '../src/game/runtime'
import { MAX_MULT, RANKS, SPARKS, multOf, rankFor, resetSync, spark, syncState } from '../src/game/fun/sync'

const at = { x: 0, y: 0, z: 0 }

describe('Sincronía (co-op combo score)', () => {
  beforeEach(() => {
    G.session = { isHost: true, mode: 'solo' } as any
    G.time = 100
    G.vars = {}
    resetSync()
  })

  it('chains co-op sparks into a growing multiplier', () => {
    spark('boing', at)
    G.time += 1
    spark('catch', at)
    G.time += 1
    spark('joint', at)
    expect(syncState.combo).toBe(3)
    expect(syncState.score).toBe(SPARKS.boing.pts * 1 + SPARKS.catch.pts * 2 + SPARKS.joint.pts * 3)
    expect(G.vars.sync[0]).toBe(syncState.score)
  })

  it('drops the chain after the window and caps the multiplier', () => {
    for (let i = 0; i < 9; i++) { spark('joint', at); G.time += 1 }
    expect(multOf(syncState.combo)).toBe(MAX_MULT)
    G.time += 10
    spark('joint', at)
    expect(syncState.combo).toBe(1)
  })

  it('solo sparks score but never build a chain (no farming a mushroom)', () => {
    for (let i = 0; i < 10; i++) { spark('pad', at); G.time += 1 }
    expect(syncState.combo).toBe(0)
    expect(syncState.score).toBe(SPARKS.pad.pts * 10)
  })

  it('ignores the same spark repeated within its cooldown', () => {
    spark('pad', at)
    spark('pad', at)
    expect(syncState.sparks).toBe(1)
  })

  it('ranks scores per level', () => {
    const [s, a, b] = RANKS.level1
    expect(rankFor('level1', s)).toBe('S')
    expect(rankFor('level1', a)).toBe('A')
    expect(rankFor('level1', b)).toBe('B')
    expect(rankFor('level1', b - 1)).toBe('C')
  })
})
