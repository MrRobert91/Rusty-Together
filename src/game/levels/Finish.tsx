import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { G, fx, isHost, onFx } from '../runtime'
import { robotsIn } from '../env/interactive'
import { envMat } from '../env/blocks'
import { GEO, M } from '../robots/materials'
import { useHud } from '../hud'
import { sfx, setMusic, stinger } from '../../core/audio'

type V3 = [number, number, number]

/** Host: end the level for both players with the session's stats. */
export function completeLevel() {
  const s = G.stats
  const time = (performance.now() - s.start) / 1000
  const stats: Record<string, string | number> = {
    'Saltos conjuntos': s.jointJumps,
    'Anillos enganchados': s.rings,
    'Rescates Cian → Ámbar': s.rescues[0],
    'Rescates Ámbar → Cian': s.rescues[1],
    'Caídas': s.falls,
  }
  if (s.bells[0] + s.bells[1] > 0) stats['Campanas (Cian / Ámbar)'] = `${s.bells[0]} / ${s.bells[1]}`
  fx('levelDone', { time, medals: [...G.medals], stats })
}

export function useLevelDoneListener() {
  useEffect(() => onFx('levelDone', (e) => {
    sfx('fanfare')
    stinger()
    setMusic('victory')
    fx('particles', { n: 'confetti', p: G.cam.target }, false)
    window.setTimeout(() => {
      if (document.pointerLockElement) document.exitPointerLock()
      useHud.setState({ levelDone: { time: e.time, medals: e.medals, stats: e.stats } })
    }, 2200)
  }), [])
}

/** Finish arch: when active and a robot walks through, the level completes. */
export function Finish({ pos, active, onDone, label = '¡Meta!' }: { pos: V3; active: () => boolean; onDone?: () => void; label?: string }) {
  useLevelDoneListener()
  const done = useRef(false)
  const c = useMemo(() => new THREE.Vector3(...pos), [pos])
  const half = useMemo(() => new THREE.Vector3(3, 2, 1.6), [])
  const lights = useRef<THREE.Group>(null!)
  useFrame(() => {
    const on = active()
    lights.current.children.forEach((m, i) => {
      const mat = (m as THREE.Mesh).material as THREE.MeshStandardMaterial
      mat.emissiveIntensity = on ? 1.5 + Math.sin(G.time * 6 + i) * 1.2 : 0.1
    })
    if (!isHost() || done.current || !on) return
    if (robotsIn(c, half).length) {
      done.current = true
      onDone?.()
      fx('banner', { title: label, color: '#5dff8a' })
      for (let i = 0; i < 4; i++) fx('particles', { n: 'confetti', p: { x: c.x + (i - 1.5) * 1.5, y: c.y + 0.5, z: c.z } })
      completeLevel()
    }
  })
  const bulbs = useMemo(() => Array.from({ length: 9 }, (_, i) => {
    const a = (i / 8) * Math.PI
    return [Math.cos(a) * 3.2, Math.sin(a) * 3.2 + 0.2, 0] as V3
  }), [])
  const bulbMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#fff3b0', emissive: '#ffcf3a', emissiveIntensity: 0.1, toneMapped: false }), [])
  return (
    <group position={pos}>
      <mesh geometry={GEO.torus()} material={envMat('yellow')} scale={[3.2, 3.2, 2]} position-y={0.2} castShadow />
      <group ref={lights}>
        {bulbs.map((b, i) => <mesh key={i} geometry={GEO.sphereLo()} material={bulbMat.clone()} position={b} scale={0.16} />)}
      </group>
      {[-1, 1].map((s) => <mesh key={s} geometry={GEO.box()} material={envMat('dark')} position={[s * 3.2, 0.1, 0]} scale={[0.5, 0.2, 0.8]} />)}
      <mesh geometry={GEO.ringFlat()} material={M.basic('#5dff8a', 0.25)} rotation-x={-Math.PI / 2} position-y={0.03} scale={2.6} />
    </group>
  )
}
