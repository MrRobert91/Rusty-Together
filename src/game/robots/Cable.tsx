import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { GEO, M } from './materials'
import type { Cable as CableData } from '../runtime'

const SEG = 18

interface Props {
  cable: () => CableData | null
  from: () => THREE.Vector3
  color: string
  thick?: number
  fistScale?: number
}

/**
 * The elastic cable: sags while flying or slack, snaps straight and vibrates
 * when taut, glows yellow when the spring is fully charged (GDD tension cue).
 */
export function CableView({ cable, from, color, thick = 4, fistScale = 1 }: Props) {
  const { line, geo, mat } = useMemo(() => {
    const geo = new LineGeometry()
    geo.setPositions(new Array(SEG * 3).fill(0))
    const mat = new LineMaterial({ color: new THREE.Color('#2b2d33'), linewidth: thick, worldUnits: false, toneMapped: false })
    mat.resolution.set(window.innerWidth, window.innerHeight)
    const line = new Line2(geo, mat)
    line.frustumCulled = false
    return { line, geo, mat }
  }, [thick])
  const fist = useRef<THREE.Group>(null!)
  const spring = useRef<THREE.Mesh>(null!)
  const pos = useMemo(() => new Float32Array(SEG * 3), [])
  const a = useMemo(() => new THREE.Vector3(), [])
  const b = useMemo(() => new THREE.Vector3(), [])
  const p = useMemo(() => new THREE.Vector3(), [])
  const baseCol = useMemo(() => new THREE.Color('#2b2d33'), [])
  const hotCol = useMemo(() => new THREE.Color('#ffd23a'), [])

  useFrame(({ size, clock }) => {
    const c = cable()
    const show = !!c && c.state !== 'idle'
    line.visible = show
    fist.current.visible = show
    if (!show || !c) return
    mat.resolution.set(size.width, size.height)
    a.copy(from())
    b.copy(c.tip)
    const len = a.distanceTo(b)
    const taut = c.state === 'attached' && len >= c.len - 0.05
    const sag = taut ? 0 : c.state === 'flying' ? Math.min(0.6, len * 0.08) : Math.min(1.2, Math.max(0, (c.len || len) - len) * 0.5 + 0.15)
    const t = clock.elapsedTime
    const vib = taut ? 0.03 + c.charge * 0.05 : 0
    for (let i = 0; i < SEG; i++) {
      const k = i / (SEG - 1)
      p.lerpVectors(a, b, k)
      const bell = Math.sin(k * Math.PI)
      p.y -= sag * bell
      if (vib) p.x += Math.sin(t * 60 + k * 20) * vib * bell
      // Coiled look while flying: a little helix.
      if (c.state === 'flying' || c.state === 'retract') {
        p.x += Math.sin(k * 40 + t * 30) * 0.03 * bell
        p.z += Math.cos(k * 40 + t * 30) * 0.03 * bell
      }
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z
    }
    geo.setPositions(pos)
    mat.color.copy(baseCol).lerp(hotCol, c.charge)
    mat.linewidth = thick * (1 + c.charge * 0.8)
    fist.current.position.copy(b)
    fist.current.lookAt(a)
    fist.current.rotateY(Math.PI)
    const sm = spring.current.material as THREE.MeshStandardMaterial
    const k = 0.05 * (1 + c.charge * 0.6 + (c.reeling ? Math.sin(t * 40) * 0.08 : 0))
    spring.current.scale.set(0.05, 0.05, k)
    sm.emissiveIntensity = c.charge * 3
  })

  return (
    <>
      <primitive object={line} />
      <group ref={fist} scale={fistScale}>
        <mesh geometry={GEO.rbox(1, 1, 1, 0.35)} material={M.dark()} scale={[0.13, 0.12, 0.12]} castShadow />
        <mesh geometry={GEO.rbox(1, 1, 1, 0.3)} material={M.ivory()} position={[0, 0.02, 0.06]} scale={[0.12, 0.06, 0.04]} />
        <mesh geometry={GEO.cyl()} material={M.accent(color)} position-z={-0.08} rotation-x={Math.PI / 2} scale={[0.065, 0.07, 0.065]} />
        <mesh ref={spring} geometry={GEO.torus()} position-z={-0.12} material={useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffd23a', emissive: '#ffb000', emissiveIntensity: 0, metalness: 0.6, roughness: 0.3 }), [])} scale={0.05} />
      </group>
    </>
  )
}
