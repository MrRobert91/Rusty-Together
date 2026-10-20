import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { G, addAnchor, fx, isHost } from '../runtime'
import { hostSet } from '../net/replication'
import { envMat, worldBox, type V3 } from './blocks'
import { GEO, M } from '../robots/materials'
import { SLOT_COLOR } from '../tuning'
import { robotsIn } from './interactive'

/* ------------------------------------------------------------ Golden nut collectibles */

/** Optional team collectible placed where a little cooperation or curiosity pays off. */
export function GoldenNut({ id, pos }: { id: string; pos: V3 }) {
  const g = useRef<THREE.Group>(null!)
  const c = useMemo(() => new THREE.Vector3(...pos), [pos])
  const half = useMemo(() => new THREE.Vector3(0.9, 1.2, 0.9), [])
  const key = `nut:${id}`
  useFrame((_, dt) => {
    const got = !!G.vars[key]
    g.current.visible = !got
    if (got) return
    g.current.rotation.y += dt * 2.2
    g.current.position.y = pos[1] + Math.sin(G.time * 2.5 + pos[0]) * 0.12
    if (isHost()) {
      const who = robotsIn(new THREE.Vector3(c.x, c.y - 0.9, c.z), half)
      if (who.length) {
        hostSet(key, 1)
        const n = Object.keys(G.vars).filter((k) => k.startsWith('nut:') && G.vars[k]).length
        hostSet('nuts', n)
        fx('sfx', { n: 'success', p: c })
        fx('particles', { n: 'stars', p: c })
        fx('toast', { text: `Tuerca dorada ${n}/5`, tone: 'good' })
      }
    }
  })
  return (
    <group ref={g} position={pos}>
      <mesh geometry={useMemo(() => new THREE.CylinderGeometry(0.32, 0.32, 0.16, 6), [])} material={M.glow('#ffcf3a', 0.9)} rotation-x={Math.PI / 2} castShadow />
      <mesh geometry={GEO.cyl()} material={envMat('dark')} rotation-x={Math.PI / 2} scale={[0.13, 0.18, 0.13]} />
      <mesh geometry={GEO.ringFlat()} material={M.basic('#fff3b0', 0.4)} scale={0.6} />
    </group>
  )
}

/* ------------------------------------------------------------ Arena bell */

/** Bell on a post. Lit in a player's colour when it's theirs to ring. */
export function Bell({ id, pos }: { id: string; pos: V3 }) {
  const anchor = useMemo(() => addAnchor({ id, kind: 'bell', pos: new THREE.Vector3(pos[0], pos[1] + 2.1, pos[2]), mini: true, big: false }), [id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { G.anchors.set(id, anchor); return () => { G.anchors.delete(id) } }, [id, anchor])
  const bell = useRef<THREE.Group>(null!)
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#b9a46a', metalness: 0.85, roughness: 0.25, emissive: '#000000' }), [])
  const st = useRef({ ringT: -9, last: -1 })
  useFrame(() => {
    const owner = G.vars[`bell:${id}`] as number | undefined
    const lit = owner === 0 || owner === 1
    anchor.enabled = lit
    anchor.owner = lit ? (owner as 0 | 1) : undefined
    mat.emissive.set(lit ? SLOT_COLOR[owner as 0 | 1] : '#000000')
    mat.emissiveIntensity = lit ? 0.9 + Math.sin(G.time * 8) * 0.3 : 0
    const ringT = G.vars[`bellT:${id}`] ?? -9
    if (ringT !== st.current.ringT) st.current.ringT = ringT
    const k = Math.max(0, 1 - (G.time - ringT) * 1.5)
    bell.current.rotation.z = Math.sin((G.time - ringT) * 18) * 0.5 * k
  })
  return (
    <group position={pos}>
      <mesh geometry={GEO.cyl()} material={envMat('dark')} position-y={1.1} scale={[0.08, 2.2, 0.08]} castShadow />
      <mesh geometry={worldBox(0.9, 0.1, 0.1)} material={envMat('yellow')} position-y={2.55} />
      <group ref={bell} position-y={2.5}>
        <mesh material={mat} position-y={-0.35} castShadow>
          <cylinderGeometry args={[0.14, 0.38, 0.5, 18, 1, true]} />
        </mesh>
        <mesh material={mat} position-y={-0.08} geometry={GEO.sphere()} scale={[0.15, 0.1, 0.15]} />
      </group>
      <mesh geometry={GEO.cyl()} material={envMat('orange')} scale={[0.45, 0.12, 0.45]} position-y={0.06} />
    </group>
  )
}

/* ------------------------------------------------------------ Seesaw */

/**
 * Physical seesaw: a dynamic plank free to rotate about X only, pivoting on
 * its centre, with limits and a gentle self-levelling spring. The host
 * simulates it; the guest sees a kinematic replica.
 */
export function Seesaw({ id, pos, size, limit = 0.32 }: { id: string; pos: V3; size: V3; limit?: number }) {
  const body = useRef<RapierRigidBody>(null)
  const host = isHost()
  const [w, h, d] = size
  useEffect(() => {
    if (!body.current) return
    G.bodies.set(id, { id, body: body.current, buf: [], heldBy: -1, dynamic: host })
    return () => { G.bodies.delete(id) }
  }, [id, host])
  const q = useMemo(() => new THREE.Quaternion(), [])
  const e = useMemo(() => new THREE.Euler(), [])
  useFrame((_, dt) => {
    if (!host || !body.current) return
    const b = body.current
    const r = b.rotation()
    q.set(r.x, r.y, r.z, r.w)
    e.setFromQuaternion(q, 'XYZ')
    const av = b.angvel()
    // Soft limits: kill outward spin at the stops (no teleporting the plank
    // out from under whoever stands on it).
    if (Math.abs(e.x) > limit) {
      const s = Math.sign(e.x)
      if (Math.sign(av.x) === s) {
        if (Math.abs(av.x) > 0.35) fx('sfx', { n: 'clank', p: new THREE.Vector3(...pos) })
        b.setAngvel({ x: -av.x * 0.2, y: 0, z: 0 }, true)
      }
      if (Math.abs(e.x) > limit + 0.04) {
        e.x = s * (limit + 0.04)
        q.setFromEuler(e)
        b.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true)
      }
    }
    // Self-levelling spring + damping (tuned for the plank's real inertia).
    const K = 12000
    const C = 11000
    b.applyTorqueImpulse({ x: ((-e.x * K - av.x * C) * Math.min(dt, 1 / 30)), y: 0, z: 0 }, true)
  })
  return (
    <>
      <RigidBody ref={body} type={host ? 'dynamic' : 'kinematicPosition'} position={pos} colliders={false} enabledRotations={[true, false, false]} enabledTranslations={[false, false, false]} angularDamping={0.3} canSleep={false}>
        <CuboidCollider args={[w / 2, h / 2, d / 2]} friction={0.8} density={60} />
        <mesh geometry={worldBox(w, h, d, 2)} material={envMat('wood')} castShadow receiveShadow />
        {[-1, 1].map((s) => <mesh key={s} geometry={worldBox(0.2, h + 0.12, d, 2)} material={envMat('yellow')} position={[(s * w) / 2, 0.02, 0]} castShadow />)}
        {[-1, 1].map((s) => <mesh key={'e' + s} geometry={worldBox(w, h + 0.1, 0.25, 1)} material={envMat('hazard')} position={[0, 0.02, (s * (d - 0.3)) / 2]} />)}
      </RigidBody>
      <group position={pos}>
        <mesh geometry={GEO.cyl()} material={envMat('dark')} rotation-z={Math.PI / 2} scale={[0.35, w + 0.6, 0.35]} />
        {[-1, 1].map((s) => (
          <mesh key={s} geometry={worldBox(0.4, 6, 0.8)} material={envMat('dark')} position={[(s * (w + 0.8)) / 2, -3, 0]} castShadow />
        ))}
      </group>
    </>
  )
}

/* ------------------------------------------------------------ Walls & glass */

export function Wall({ pos, size, kind = 'metal', rotY = 0 }: { pos: V3; size: V3; kind?: string; rotY?: number }) {
  const [w, h, d] = size
  return (
    <RigidBody type="fixed" position={pos} rotation-y={rotY} colliders={false}>
      <CuboidCollider args={[w / 2, h / 2, d / 2]} position={[0, h / 2, 0]} />
      <mesh geometry={worldBox(w, h, d, 2)} material={envMat(kind)} position-y={h / 2} castShadow receiveShadow />
      <mesh geometry={worldBox(w + 0.06, 0.14, d + 0.06, 1)} material={envMat('yellow')} position-y={h} />
    </RigidBody>
  )
}

export function Glass({ pos, size, rotY = 0 }: { pos: V3; size: V3; rotY?: number }) {
  const [w, h, d] = size
  return (
    <RigidBody type="fixed" position={pos} rotation-y={rotY} colliders={false}>
      <CuboidCollider args={[w / 2, h / 2, d / 2]} position={[0, h / 2, 0]} />
      <mesh geometry={worldBox(w, h, d, 2)} material={envMat('glass')} position-y={h / 2} />
      <mesh geometry={worldBox(w, 0.08, d + 0.04, 1)} material={envMat('dark')} position-y={h} />
    </RigidBody>
  )
}

/** Crane beam with hanging hooks: frames the monkey-bar rings. */
export function CraneBeam({ from, to, y }: { from: [number, number]; to: [number, number]; y: number }) {
  const len = Math.hypot(to[0] - from[0], to[1] - from[1])
  const ang = Math.atan2(to[0] - from[0], to[1] - from[1])
  const mid: V3 = [(from[0] + to[0]) / 2, y, (from[1] + to[1]) / 2]
  return (
    <group position={mid} rotation-y={ang}>
      <mesh geometry={worldBox(0.6, 0.7, len, 2)} material={envMat('yellow')} castShadow />
      <mesh geometry={worldBox(0.7, 0.12, len, 2)} material={envMat('dark')} position-y={-0.4} />
      {Array.from({ length: Math.floor(len / 2) }, (_, i) => (
        <mesh key={i} geometry={worldBox(0.08, 0.6, 0.08)} material={envMat('dark')} position={[0.25, 0, -len / 2 + 1 + i * 2]} rotation-x={0.7} />
      ))}
    </group>
  )
}
