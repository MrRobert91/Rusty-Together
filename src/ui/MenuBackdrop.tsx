import { Suspense, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { RobotModel, makeView } from '../game/robots/RobotModel'
import { Atmosphere } from '../game/env/Atmosphere'
import { Block, Tree, Scaffold, Banner } from '../game/env/blocks'
import { Ring } from '../game/env/interactive'
import { EffectComposer, Bloom, Vignette, ToneMapping, SMAA } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { Physics } from '@react-three/rapier'
import { useSettings } from '../core/settings'

/** Living title backdrop: Cian and Ámbar idle on a mesa while the camera drifts. */
export function MenuBackdrop() {
  const quality = useSettings((s) => s.quality)
  return (
    <div className="backdrop">
      <Canvas shadows dpr={[1, 1.5]} camera={{ fov: 40, position: [6, 3, 8] }} gl={{ antialias: false }} onCreated={({ gl }) => { gl.toneMapping = THREE.NoToneMapping }}>
        <Suspense fallback={null}>
          <Physics paused>
            <Atmosphere />
            <Block pos={[0, 0, 0]} size={[10, 14, 8]} />
            <Block pos={[-9, -3, -6]} size={[6, 10, 6]} />
            <Tree pos={[-3.5, 0, -2.5]} s={1.1} />
            <Tree pos={[3.8, 0, -2.8]} s={0.8} />
            <Scaffold pos={[10, -6, -10]} h={14} />
            <Banner pos={[2.6, 2.8, -3.9]} />
            <Ring id="menu-ring" pos={[-2.2, 2.6, -1]} mount="post" />
          </Physics>
          <Duo />
          <OrbitCam />
          {quality === 'high' && (
            <EffectComposer multisampling={0}>
              <Bloom mipmapBlur luminanceThreshold={0.85} intensity={0.7} />
              <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
              <SMAA />
              <Vignette offset={0.25} darkness={0.5} />
            </EffectComposer>
          )}
        </Suspense>
      </Canvas>
    </div>
  )
}

function OrbitCam() {
  useFrame(({ camera, clock }) => {
    const t = clock.elapsedTime * 0.06
    camera.position.set(Math.sin(t) * 7.5 + 1.5, 2.6 + Math.sin(t * 2) * 0.3, Math.cos(t) * 6 + 4)
    camera.lookAt(0.6, 1.0, 0)
  })
  return null
}

function Duo() {
  const views = useMemo(() => [makeView(), makeView()], [])
  const g = [useRef<THREE.Group>(null!), useRef<THREE.Group>(null!)]
  const st = useRef({ next: 2, who: 0 })
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const s = st.current
    if (t > s.next) {
      const v = views[s.who]
      v.emote = 1 + Math.floor(Math.random() * 4)
      v.emoteT = t
      if (Math.random() < 0.3) v.jumpT = t
      s.who = 1 - s.who
      s.next = t + 2.5 + Math.random() * 2
    }
    for (let i = 0; i < 2; i++) {
      const v = views[i]
      v.now = t
      v.yaw = (i === 0 ? 0.5 : -0.4) + Math.sin(t * 0.4 + i) * 0.15
      const jt = t - v.jumpT
      const hop = jt < 0.5 ? Math.sin((jt / 0.5) * Math.PI) * 0.5 : 0
      v.grounded = hop < 0.02
      if (jt > 0.48 && jt < 0.52) { v.landT = t; v.landImpact = 0.6 }
      g[i].current.position.y = hop
      v.lookAt = g[1 - i].current.position.clone().setY(1)
    }
  })
  return (
    <>
      <group ref={g[0]} position={[-0.7, 0, 0.6]}><RobotModel variant="mini" slot={0} view={views[0]} /></group>
      <group ref={g[1]} position={[1.0, 0, 0.3]}><RobotModel variant="mini" slot={1} view={views[1]} /></group>
    </>
  )
}
