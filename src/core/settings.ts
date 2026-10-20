import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Settings {
  playerName: string
  masterVolume: number
  musicVolume: number
  sfxVolume: number
  voiceVolume: number
  mouseSensitivity: number
  stickSensitivity: number
  invertY: boolean
  /** GDD accessibility: widens sync windows to 450 ms and grips. */
  assist: boolean
  reduceShake: boolean
  reduceFlashes: boolean
  quality: 'high' | 'low'
  grabToggle: boolean
  pushToTalk: boolean
  micDeviceId: string
  showFps: boolean
  set: (patch: Partial<Settings>) => void
}

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      playerName: '',
      masterVolume: 0.8,
      musicVolume: 0.55,
      sfxVolume: 0.9,
      voiceVolume: 1,
      mouseSensitivity: 1,
      stickSensitivity: 1,
      invertY: false,
      assist: false,
      reduceShake: false,
      reduceFlashes: false,
      quality: 'high',
      grabToggle: false,
      pushToTalk: false,
      micDeviceId: '',
      showFps: false,
      set: (patch) => set(patch),
    }),
    { name: 'rusty-together-settings', version: 1 },
  ),
)

export const settings = () => useSettings.getState()
