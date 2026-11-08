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

/** The single on-screen text channel: objectives, hints, signs and chatter. */
export interface Info {
  key: string
  text: string
  tone: 'obj' | 'sign' | 'info' | 'good' | 'warn' | 'cyan' | 'amber' | 'talk'
  who?: string
  color?: string
}

export interface HudState {
  info: Info | null
  infoOpen: boolean
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
  levelDone: null | { time: number; medals: string[]; stats: Record<string, string | number>; score?: number; best?: number; sparks?: number }
  hint: string | null
  paused: boolean
  set: (p: Partial<HudState>) => void
}

export const useHud = create<HudState>((set) => ({
  info: null,
  infoOpen: false,
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

/** How long a message stays open before it folds back into the ⓘ button. */
export const INFO_MS = 4000
let infoTimer = 0
/**
 * Show a message in the info bubble (top right). It closes by itself after
 * INFO_MS and only the ⓘ button stays; showing the same key again while it is
 * open just keeps it open (a sign you keep reading).
 */
let infoShownAt = 0
export function showInfo(text: string, tone: Info['tone'] = 'info', opts: { key?: string; who?: string; color?: string; ms?: number; weak?: boolean } = {}) {
  if (!text) return
  const key = opts.key ?? `${tone}:${text}`
  const st = useHud.getState()
  const same = st.infoOpen && st.info?.key === key
  // A weak message (a sign you walk past) never covers a fresh objective or alert.
  if (opts.weak && !same && st.infoOpen && st.info?.tone !== 'sign' && performance.now() - infoShownAt < INFO_MS) return
  if (!same) { infoShownAt = performance.now(); useHud.setState({ info: { key, text, tone, who: opts.who, color: opts.color }, infoOpen: true }) }
  window.clearTimeout(infoTimer)
  infoTimer = window.setTimeout(() => useHud.setState({ infoOpen: false }), opts.ms ?? INFO_MS)
}
export function hideInfo() { window.clearTimeout(infoTimer); useHud.setState({ infoOpen: false }) }

let toastId = 1
export function toast(text: string, tone: Toast['tone'] = 'info', ms = 3200) {
  // In game, every text message goes through the auto-hiding info bubble.
  showInfo(text, tone)
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
  showInfo(text, 'talk', { who, color })
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
