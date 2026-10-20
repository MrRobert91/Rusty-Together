import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { CODE_ALPHABET, CODE_LENGTH, normalizeCode, randomCode } from '../shared/protocol'
import { ballistic, camRelative, wrapAngle, dampAngle } from '../src/game/runtime'
import { GRAVITY, MINI, BIG } from '../src/game/tuning'

describe('room codes', () => {
  it('generates codes from the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const c = randomCode()
      expect(c).toHaveLength(CODE_LENGTH)
      for (const ch of c) expect(CODE_ALPHABET).toContain(ch)
    }
  })
  it('normalizes what people type or paste', () => {
    expect(normalizeCode(' ab-c d9 ')).toBe('ABCD9')
    expect(normalizeCode('abcdefgh')).toBe('ABCDE')
  })
})

describe('ballistic launches', () => {
  it('lands exactly on the target after the given time', () => {
    const from = new Vector3(0, 1, 0)
    const to = new Vector3(3, 2, -6)
    const T = 1.2
    const v = ballistic(from, to, T, GRAVITY)
    const p = from.clone().addScaledVector(v, T)
    p.y -= 0.5 * GRAVITY * T * T
    expect(p.distanceTo(to)).toBeLessThan(1e-6)
  })
})

describe('camera-relative input', () => {
  it('maps stick forward to the camera forward (camera behind looking -Z)', () => {
    const v = camRelative({ x: 0, y: 1 }, 0)
    expect(v.z).toBeCloseTo(-1)
    expect(v.x).toBeCloseTo(0)
  })
  it('maps stick right to camera right', () => {
    const v = camRelative({ x: 1, y: 0 }, 0)
    expect(v.x).toBeCloseTo(1)
  })
})

describe('angles', () => {
  it('wraps into [-π, π]', () => {
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(Math.PI)
    expect(wrapAngle(-Math.PI * 2.5)).toBeCloseTo(-Math.PI / 2)
  })
  it('damps through the short way around', () => {
    const a = dampAngle(Math.PI - 0.1, -Math.PI + 0.1, 100, 1)
    expect(Math.abs(wrapAngle(a - (-Math.PI + 0.1)))).toBeLessThan(1e-3)
  })
})

describe('GDD tuning invariants', () => {
  const jumpV = Math.sqrt(2 * GRAVITY * MINI.jumpHeight)
  const airtime = (2 * jumpV) / GRAVITY
  it('a mini clears the 2 m "safe gap" but not a 4 m one', () => {
    expect(MINI.speed * airtime).toBeGreaterThan(2.4)
    expect(MINI.speed * airtime).toBeLessThan(4)
  })
  it('the joint jump is far stronger than a unilateral hop', () => {
    expect(BIG.jointVel / BIG.hopVel).toBeGreaterThan(1.7)
  })
  it('sync windows follow the GDD (250/350 ms, assist 450 ms)', () => {
    expect(BIG.jumpWindow).toBe(0.25)
    expect(BIG.cableWindow).toBe(0.35)
    expect(BIG.assistWindow).toBe(0.45)
    expect(BIG.coupleHold).toBe(0.6)
    expect(BIG.mergeTime).toBe(1.2)
  })
})
