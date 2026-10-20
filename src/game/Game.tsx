import { Suspense, useEffect, useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { PerformanceMonitor, Preload } from '@react-three/drei'
import { usePerf, tier, stepDownTier } from '../core/device'
import { ShadowToggle } from './perf/ShadowToggle'
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
import { StaticBatcher } from './perf/StaticBatch'
import { GRAVITY } from './tuning'
import { LEVELS } from './levels'
import { bindCheckpoints, cps, reachCheckpoint } from './levels/checkpoints'
import { resetVarListeners } from './net/replication'
import type { Session } from '../net/session'
import { useHud, toast } from './hud'
import { setMusic } from '../core/audio'

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
  const tierNow = usePerf((s) => s.tier)
  // GL context options are fixed at creation: decide them from the initial tier.
  const initialTier = useMemo(() => tier(), [])

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
      shadows={initialTier !== 'low'}
      dpr={tierNow === 'high' ? [1, 1.75] : tierNow === 'medium' ? [1, 1.4] : [0.75, 1.15]}
      gl={{ antialias: initialTier === 'low', powerPreference: 'high-performance', stencil: false }}
      camera={{ fov: 55, near: 0.1, far: 700, position: [0, 5, 10] }}
      onCreated={({ gl, scene }) => {
        if (import.meta.env.DEV) { (window as any).__scene = scene; (window as any).__gl = gl }
        gl.toneMapping = THREE.NoToneMapping
        gl.shadowMap.type = THREE.PCFShadowMap
      }}
    >
      <Suspense fallback={null}>
        <Physics timeStep={1 / 60} gravity={[0, -GRAVITY, 0]} updatePriority={-50} paused={paused} interpolate>
          <Atmosphere />
          <def.Scene />
          <StaticBatcher />
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
        <PerformanceMonitor
          bounds={() => [42, 120]}
          flipflops={3}
          onDecline={() => { if (stepDownTier()) toast(`Calidad ajustada a «${tier() === 'medium' ? 'media' : 'baja'}» para ir más fluido`, 'info', 2600) }}
        />
        <ShadowToggle />
        <Preload all />
      </Suspense>
    </Canvas>
  )
}
