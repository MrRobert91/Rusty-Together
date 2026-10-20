import type { FC } from 'react'
import type { MusicMood } from '../../core/audio'
import { Sandbox, setupSandbox } from './Sandbox'
import { Tutorial, setupTutorial } from './Tutorial'
import { Level1, setupLevel1 } from './level1/Level1'

export interface LevelDef {
  id: string
  name: string
  Scene: FC
  /** Called synchronously before the scene mounts (checkpoints, AI, rules). */
  setup: () => void
  startCp: string
  music: MusicMood
}

export const LEVELS: Record<string, LevelDef> = {
  tutorial: { id: 'tutorial', name: 'Taller de pruebas', Scene: Tutorial, setup: setupTutorial, startCp: 't0', music: 'explore' },
  level1: { id: 'level1', name: 'Muelles de rebote', Scene: Level1, setup: setupLevel1, startCp: 'c1', music: 'explore' },
  sandbox: { id: 'sandbox', name: 'Banco de pruebas', Scene: Sandbox, setup: setupSandbox, startCp: 's0', music: 'explore' },
}
