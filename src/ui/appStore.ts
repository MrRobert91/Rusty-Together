import { create } from 'zustand'
import type { Session } from '../net/session'

export type Screen = 'title' | 'menu' | 'join' | 'lobby' | 'game'

export interface AppState {
  screen: Screen
  level: string
  session: Session | null
  runId: number
  settingsOpen: boolean
  controlsOpen: boolean
  set: (p: Partial<AppState>) => void
}

export const useApp = create<AppState>((set) => ({
  screen: 'title',
  level: 'tutorial',
  session: null,
  runId: 0,
  settingsOpen: false,
  controlsOpen: false,
  set: (p) => set(p),
}))
