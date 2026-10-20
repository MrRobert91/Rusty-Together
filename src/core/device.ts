import { create } from 'zustand'
import { settings, useSettings } from './settings'

/** Device facts used to pick controls and the rendering tier. */
export const isTouchDevice = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window || navigator.maxTouchPoints > 0)

export const isPhoneLike = () =>
  typeof window !== 'undefined' && (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (isTouchDevice() && Math.min(screen.width, screen.height) < 820))

export type Tier = 'high' | 'medium' | 'low'

function detectTier(): Tier {
  if (typeof window === 'undefined') return 'high'
  if (isPhoneLike()) return 'low'
  const cores = navigator.hardwareConcurrency ?? 8
  const mem = (navigator as any).deviceMemory ?? 8
  if (cores <= 4 || mem <= 4) return 'medium'
  return 'high'
}

/** Effective rendering tier ("auto" resolves here and may step down at runtime). */
export const usePerf = create<{ tier: Tier; auto: boolean; downgrades: number }>(() => {
  const q = settings().quality
  return { tier: q === 'auto' ? detectTier() : q, auto: q === 'auto', downgrades: 0 }
})

useSettings.subscribe((s, prev) => {
  if (s.quality === prev.quality) return
  usePerf.setState({ tier: s.quality === 'auto' ? detectTier() : s.quality, auto: s.quality === 'auto' })
})

/** Called by the performance monitor when the frame rate can't be held. */
export function stepDownTier() {
  const p = usePerf.getState()
  if (!p.auto) return false
  const next: Tier | null = p.tier === 'high' ? 'medium' : p.tier === 'medium' ? 'low' : null
  if (!next) return false
  usePerf.setState({ tier: next, downgrades: p.downgrades + 1 })
  return true
}

export const tier = () => usePerf.getState().tier
