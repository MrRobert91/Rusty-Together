import { Suspense, useEffect, useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { AdaptiveDpr, Preload } from '@react-three/drei'
import * as THREE from 'three'
import { G, resetRuntime, localSlot } from './runtime'
import { Simulation, resetSimulationState } from './Simulation'
import { HudSystem } from './HudSystem'
import { CameraRig } from './CameraRig'
import { Atmosphere } from './env/Atmosphere'
import { MiniRobot } from './robots/MiniRobot'
import { BigRobot } from './robots/BigRobot'
import { MergeFx } from './robots/MergeFx'
import { Particles } from './fx/Particles'
import { PostFX } from './PostFX'
import { GRAVITY } from './tuning'
import { LEVELS } from './levels'
import { bindCheckpoints, cps, reachCheckpoint } from './levels/checkpoints'
import { resetVarListeners } from './net/replication'
import type { Session } from '../net/session'
import { useHud } from './hud'
import { setMusic } from '../core/audio'
import { useSettings } from '../core/settings'

export function Game({ level, session }: { level: string; session: Session }) {
  const def = LEVELS[level]
  // Reset the shared runtime synchronously, before any child registers itself.
  const ready = useMemo(() => {
    resetVarListeners()
    resetRuntime(level, session)
    resetSimulationState()
    def.setup()
    useHud.setState({ form: 'split', prompts: [], arena: null, levelDone: null, banner: null, roomTitle: null, objective: '', paused: false, stickers: useHud.getState().stickers })
    return true
  }, [level, session, def])
  const [paused, setPaused] = useState(false)
  const quality = useSettings((s) => s.quality)

  useEffect(() => {
    const off = bindCheckpoints()
    if (session.isHost) reachCheckpoint(def.startCp, true)
    else {
      // The guest starts at the same checkpoint and is corrected by the host's vars.
      G.checkpoint = cps.get(def.startCp) ?? null
    }
    setMusic(def.music)
    const unsub = useHud.subscribe((s) => setPaused(s.paused))
    return () => { off(); unsub() }
  }, [def, session])

  const start = cps.get(def.startCp)!
  const spawnA = start.spawns[0]
  const spawnB = start.spawns[1]
  void localSlot

  if (!ready) return null
  return (
    <Canvas
      shadows
      dpr={quality === 'high' ? [1, 1.75] : [0.75, 1.25]}
      gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
      camera={{ fov: 55, near: 0.1, far: 900, position: [0, 5, 10] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.NoToneMapping
        gl.shadowMap.type = THREE.PCFSoftShadowMap
      }}
    >
      <Suspense fallback={null}>
        <Physics timeStep={1 / 60} gravity={[0, -GRAVITY, 0]} updatePriority={-50} paused={paused} interpolate>
          <Atmosphere />
          <def.Scene />
          <MiniRobot mini={G.minis[0]} spawn={spawnA} yaw={start.yaw} />
          <MiniRobot mini={G.minis[1]} spawn={spawnB} yaw={start.yaw} />
          <BigRobot />
          <MergeFx />
          <Simulation />
          <HudSystem />
          <CameraRig />
        </Physics>
        <Particles />
        <PostFX />
        <AdaptiveDpr pixelated={false} />
        <Preload all />
      </Suspense>
    </Canvas>
  )
}
