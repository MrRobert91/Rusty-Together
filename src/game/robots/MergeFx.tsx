import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { G } from '../runtime'
import { BIG } from '../tuning'
import { RobotModel, makeView } from './RobotModel'
import { GEO } from './materials'

/**
 * The 1.2 s coupling: both minis hop toward the plate, spin around each
 * other, fold in, and a flash reveals the joined body. Pure presentation:
 * the simulation already decided the outcome.
 */
export function MergeFx() {
  const views = useMemo(() => [makeView(), makeView()], [])
  const groups = [useRef<THREE.Group>(null!), useRef<THREE.Group>(null!)]
  const flash = useRef<THREE.Mesh>(null!)
  const ring = useRef<THREE.Mesh>(null!)
  const tmp = useMemo(() => new THREE.Vector3(), [])

  useFrame(() => {
    const merging = G.form === 'merging'
    const t = merging ? Math.min(1, (G.time - G.formT) / BIG.mergeTime) : 1
    for (let i = 0; i < 2; i++) {
      const g = groups[i].current
      g.visible = merging && t < 0.92
      if (!g.visible) continue
      const from = G.formFrom[i]
      const e = t * t * (3 - 2 * t)
      const ang = e * Math.PI * 3 + i * Math.PI
      const rad = (1 - e) * 1.4
      tmp.lerpVectors(from, G.formAt, e)
      tmp.x += Math.cos(ang) * rad * e
      tmp.z += Math.sin(ang) * rad * e
      tmp.y = THREE.MathUtils.lerp(from.y - 0.5, G.formAt.y, e) + Math.sin(e * Math.PI) * 2.2
      g.position.copy(tmp)
      g.rotation.y = ang * 1.5
      g.scale.setScalar(1 - Math.max(0, e - 0.75) * 3)
      const v = views[i]
      v.now = G.time
      v.grounded = false
      v.vel.set(0, 4, 0)
      v.expression = 'happy'
    }
    const f = flash.current
    const ft = merging ? Math.max(0, (t - 0.8) / 0.2) : 0
    f.visible = merging && ft > 0
    f.position.copy(G.formAt).setY(G.formAt.y + 1.4)
    f.scale.setScalar(0.5 + ft * 3)
    ;(f.material as THREE.MeshBasicMaterial).opacity = (1 - Math.abs(ft - 0.5) * 2) * 0.9
    const r = ring.current
    r.visible = merging
    r.position.copy(G.formAt).setY(G.formAt.y + 0.1)
    r.scale.setScalar(1 + t * 2.5)
    ;(r.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.8
  })

  return (
    <>
      {[0, 1].map((i) => (
        <group key={i} ref={groups[i]} visible={false}>
          <group position-y={-0.5}>
            <RobotModel variant="mini" slot={i as 0 | 1} view={views[i]} />
          </group>
        </group>
      ))}
      <mesh ref={flash} geometry={GEO.sphere()} material={new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, toneMapped: false, depthWrite: false })} visible={false} />
      <mesh ref={ring} geometry={GEO.ringFlat()} rotation-x={-Math.PI / 2} material={new THREE.MeshBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0.8, toneMapped: false, depthWrite: false })} visible={false} />
    </>
  )
}
