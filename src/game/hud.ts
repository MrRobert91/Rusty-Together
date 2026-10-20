import { create } from 'zustand'
import type { Btn } from '../core/input'

export interface Prompt {
  id: string
  btn?: Btn
  hold?: boolean
  text: string
  progress?: number
}

export interface Toast {
  id: number
  text: string
  tone: 'info' | 'good' | 'warn' | 'cyan' | 'amber'
  t: number
}

export interface HudState {
  roomTitle: { n: string; title: string; mode: string } | null
  objective: string
  prompts: Prompt[]
  toasts: Toast[]
  fade: number
  letterbox: boolean
  form: 'split' | 'merging' | 'joined' | 'splitting'
  meter: { label: string; value: number; color: string } | null
  partnerWaiting: string | null
  /** Joined body readiness indicators per pilot (0..1 flash). */
  pilotReady: [number, number]
  pilotLegs: [{ x: number; y: number }, { x: number; y: number }]
  tension: number
  arena: null | { round: number; time: number; scores: [number, number]; phase: string; winner?: number }
  banner: { title: string; sub?: string; color?: string } | null
  subtitle: { who: string; text: string; color: string } | null
  stickers: string[]
  levelDone: null | { time: number; medals: string[]; stats: Record<string, string | number> }
  hint: string | null
  paused: boolean
  set: (p: Partial<HudState>) => void
}

export const useHud = create<HudState>((set) => ({
  roomTitle: null,
  objective: '',
  prompts: [],
  toasts: [],
  fade: 0,
  letterbox: false,
  form: 'split',
  meter: null,
  partnerWaiting: null,
  pilotReady: [0, 0],
  pilotLegs: [{ x: 0, y: 0 }, { x: 0, y: 0 }],
  tension: 0,
  arena: null,
  banner: null,
  subtitle: null,
  stickers: [],
  levelDone: null,
  hint: null,
  paused: false,
  set: (p) => set(p),
}))

let toastId = 1
export function toast(text: string, tone: Toast['tone'] = 'info', ms = 3200) {
  const t: Toast = { id: toastId++, text, tone, t: performance.now() }
  useHud.setState((s) => ({ toasts: [...s.toasts.slice(-3), t] }))
  window.setTimeout(() => useHud.setState((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) })), ms)
}

let bannerTimer = 0
export function banner(title: string, sub?: string, color?: string, ms = 2600) {
  window.clearTimeout(bannerTimer)
  useHud.setState({ banner: { title, sub, color } })
  bannerTimer = window.setTimeout(() => useHud.setState({ banner: null }), ms)
}

let subTimer = 0
export function subtitle(who: string, text: string, color: string, ms = 3200) {
  window.clearTimeout(subTimer)
  useHud.setState({ subtitle: { who, text, color } })
  subTimer = window.setTimeout(() => useHud.setState({ subtitle: null }), ms)
}

let titleTimer = 0
export function roomTitle(n: string, title: string, mode: string) {
  window.clearTimeout(titleTimer)
  useHud.setState({ roomTitle: { n, title, mode } })
  titleTimer = window.setTimeout(() => useHud.setState({ roomTitle: null }), 4200)
}

/** Prompts are rebuilt every frame by gameplay systems, then committed once. */
const pending: Prompt[] = []
export function prompt(p: Prompt) { pending.push(p) }
export function commitPrompts() {
  const cur = useHud.getState().prompts
  const same = cur.length === pending.length && cur.every((c, i) => c.id === pending[i].id && c.text === pending[i].text && Math.abs((c.progress ?? 0) - (pending[i].progress ?? 0)) < 0.04)
  if (!same) useHud.setState({ prompts: pending.slice() })
  pending.length = 0
}
