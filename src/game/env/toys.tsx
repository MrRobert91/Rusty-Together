import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BallCollider, CuboidCollider, CylinderCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { G, addAnchor, fx, isHost } from '../runtime'
import { hostSet } from '../net/replication'
import { spark } from '../fun/sync'
import { envMat, worldBox, type V3 } from './blocks'
import { GEO } from '../robots/materials'
import { MINI } from '../tuning'
import { robotsIn } from './interactive'

/* ------------------------------------------------------------------ */
/* Beach ball: punch it (or just run into it). Host-simulated.          */
/* ------------------------------------------------------------------ */

function ballTex() {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 128
  const g = c.getContext('2d')!
  const cols = ['#ff4f5e', '#ffffff', '#ffd23a', '#ffffff', '#22c7d6', '#ffffff', '#ff9a1f', '#ffffff']
  cols.forEach((col, i) => { g.fillStyle = col; g.fillRect((i * 256) / cols.length, 0, 256 / cols.length + 1, 128) })
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, 256, 10)
  g.fillRect(0, 118, 256, 10)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

const BALL_R = 0.55

export function BeachBall({ id, pos, killY = -12 }: { id: string; pos: V3; killY?: number }) {
  const body = useRef<RapierRigidBody>(null)
  const host = isHost()
  const home = useMemo(() => new THREE.Vector3(...pos), [pos])
  const bodyId = `ball:${id}`
  const anchor = useMemo(() => addAnchor({ id: `kick:${id}`, kind: 'ball', pos: home.clone(), mini: true, big: false }), [id]) // eslint-disable-line react-hooks/exhaustive-deps
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ map: ballTex(), roughness: 0.35, metalness: 0.05 }), [])
  useEffect(() => {
    if (!body.current) return
    G.bodies.set(bodyId, { id: bodyId, body: body.current, buf: [], heldBy: -1, dynamic: host })
    G.anchors.set(anchor.id, anchor)
    G.punchHandlers.set(anchor.id, (slot) => {
      const b = body.current
      if (!b) return
      const m = G.minis[slot]
      const p = b.translation()
      const d = new THREE.Vector3(p.x - m.pos.x, 0, p.z - m.pos.z)
      if (d.lengthSq() < 1e-4) d.set(Math.sin(m.yaw), 0, Math.cos(m.yaw))
      d.normalize()
      // A punt: mostly forward, a nice lob, some spin.
      b.setLinvel({ x: d.x * 9.5, y: 6.5, z: d.z * 9.5 }, true)
      b.setAngvel({ x: d.z * 12, y: (Math.random() - 0.5) * 6, z: -d.x * 12 }, true)
      fx('sfx', { n: 'kick', p })
      fx('particles', { n: 'stars', p })
      spark('kick', p)
    })
    return () => { G.bodies.delete(bodyId); G.anchors.delete(anchor.id); G.punchHandlers.delete(anchor.id) }
  }, [bodyId, host, anchor])
  const respawn = () => {
    const b = body.current
    if (!b) return
    b.setTranslation({ x: home.x, y: home.y + 2.5, z: home.z }, true)
    b.setLinvel({ x: 0, y: 0, z: 0 }, true)
    b.setAngvel({ x: 0, y: 0, z: 0 }, true)
    fx('particles', { n: 'poof', p: { x: home.x, y: home.y + 2.5, z: home.z } })
    fx('sfx', { n: 'pop', p: home })
  }
  useFrame(() => {
    const b = body.current
    if (!b) return
    const p = b.translation()
    anchor.pos.set(p.x, p.y, p.z)
    if (!host) return
    if (p.y < killY) respawn()
    // Scored: the goal asks for the ball back.
    if (G.vars[`ballHome:${id}`] && G.time > G.vars[`ballHome:${id}`]) { hostSet(`ballHome:${id}`, 0); respawn() }
  })
  return (
    <RigidBody ref={body} type={host ? 'dynamic' : 'kinematicPosition'} position={pos} colliders={false} mass={1.2} linearDamping={0.25} angularDamping={0.3} userData={{ ball: id }} ccd canSleep={false}>
      <BallCollider args={[BALL_R]} restitution={0.78} friction={0.6} />
      <mesh geometry={GEO.sphere()} material={mat} scale={BALL_R} castShadow />
    </RigidBody>
  )
}

/** Goal frame: the ball inside the net scores (host). */
export function Goal({ id, ball, pos, rotY = 0, w = 3.4, h = 2.2 }: { id: string; ball: string; pos: V3; rotY?: number; w?: number; h?: number }) {
  const st = useRef({ cool: 0 })
  const netMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }), [])
  const net = useMemo(() => {
    const pts: number[] = []
    const d = 1.2
    for (let x = -w / 2; x <= w / 2 + 1e-3; x += 0.3) pts.push(x, 0, -d, x, h, -d, x, h, 0, x, h, -d)
    for (let y = 0; y <= h + 1e-3; y += 0.3) pts.push(-w / 2, y, -d, w / 2, y, -d)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [w, h])
  const c = useMemo(() => {
    const s = Math.sin(rotY), co = Math.cos(rotY)
    // Box centred inside the net (local -z is the back of the goal).
    return new THREE.Vector3(pos[0] - s * 0.6, pos[1] + h / 2, pos[2] - co * 0.6)
  }, [pos, rotY, h])
  const flash = useRef<THREE.MeshStandardMaterial>(null!)
  useFrame((_, dt) => {
    st.current.cool = Math.max(0, st.current.cool - dt)
    const lit = G.time - ((G.vars[`goalT:${id}`] as number) ?? -9) < 2
    if (flash.current) flash.current.emissiveIntensity = lit ? 1.5 + Math.sin(G.time * 20) * 1.2 : 0.25
    if (!isHost() || st.current.cool > 0) return
    const nb = G.bodies.get(`ball:${ball}`)
    if (!nb) return
    const p = nb.body.translation()
    // Rotate into goal space.
    const dx = p.x - c.x, dz = p.z - c.z
    const lx = dx * Math.cos(rotY) - dz * Math.sin(rotY)
    const lz = dx * Math.sin(rotY) + dz * Math.cos(rotY)
    if (Math.abs(lx) < w / 2 - 0.2 && Math.abs(lz) < 0.55 && p.y > pos[1] && p.y < pos[1] + h) {
      st.current.cool = 3
      const n = ((G.vars[`goals:${id}`] as number) ?? 0) + 1
      hostSet(`goals:${id}`, n)
      hostSet(`goalT:${id}`, G.time)
      hostSet(`ballHome:${ball}`, G.time + 1.6)
      fx('sfx', { n: 'goal', p: c })
      for (let i = 0; i < 2; i++) fx('particles', { n: 'confetti', p: { x: c.x + (i - 0.5) * 2, y: c.y + 0.6, z: c.z } })
      fx('banner', { title: n === 1 ? '¡GOOOL!' : `¡GOOOL! ×${n}`, color: '#8dff9a' })
      spark('goal', c)
    }
  })
  return (
    <group position={pos} rotation-y={rotY}>
      {/* Posts and crossbar */}
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={GEO.cyl()} material={envMat('ivory')} position={[(s * w) / 2, h / 2, 0]} scale={[0.09, h, 0.09]} castShadow />
      ))}
      <mesh geometry={GEO.cyl()} rotation-z={Math.PI / 2} position={[0, h, 0]} scale={[0.09, w + 0.1, 0.09]} castShadow>
        <meshStandardMaterial ref={flash} color="#ff4f5e" emissive="#ff4f5e" emissiveIntensity={0.25} />
      </mesh>
      <lineSegments geometry={net}><lineBasicMaterial color="#ffffff" transparent opacity={0.7} /></lineSegments>
      <mesh position={[0, h / 2, -1.2]} material={netMat}><planeGeometry args={[w, h]} /></mesh>
      {/* Physical back and sides so the ball stays in */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[w / 2, h / 2, 0.05]} position={[0, h / 2, -1.25]} />
        <CuboidCollider args={[0.05, h / 2, 0.6]} position={[-w / 2, h / 2, -0.6]} />
        <CuboidCollider args={[0.05, h / 2, 0.6]} position={[w / 2, h / 2, -0.6]} />
        <CuboidCollider args={[w / 2, 0.05, 0.6]} position={[0, h, -0.6]} />
      </RigidBody>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Bouncy mushroom: a springy cap. Chains of them lead to secrets.      */
/* ------------------------------------------------------------------ */

const CAP_COLORS = ['#ff4f7b', '#22c7d6', '#ffb02e', '#9a6bff'] as const

export function Mushroom({ pos, bounce = 15, color = 0 }: { pos: V3; bounce?: number; color?: number }) {
  const cap = useRef<THREE.Group>(null!)
  const center = useMemo(() => new THREE.Vector3(pos[0], pos[1] + 0.8, pos[2]), [pos])
  const half = useMemo(() => new THREE.Vector3(1.05, 0.6, 1.05), [])
  const st = useRef({ t: -9 })
  const capMat = useMemo(() => new THREE.MeshStandardMaterial({ color: CAP_COLORS[color % CAP_COLORS.length], roughness: 0.4, emissive: CAP_COLORS[color % CAP_COLORS.length], emissiveIntensity: 0.12 }), [color])
  const spots = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const a = (i / 7) * Math.PI * 2 + i
    const r = i === 0 ? 0 : 0.62
    return [Math.cos(a) * r, i === 0 ? 0.52 : 0.36, Math.sin(a) * r] as V3
  }), [])
  useFrame(() => {
    if (robotsIn(center, half).length) st.current.t = G.time
    const k = Math.max(0, 1 - (G.time - st.current.t) * 2.5)
    // Jelly wobble after each bounce.
    const w = Math.sin(k * Math.PI * 4) * 0.22 * k
    cap.current.scale.set(1 + w, 1 - w, 1 + w)
  })
  return (
    <group position={pos}>
      <RigidBody type="fixed" colliders={false} userData={{ bounce }}>
        <CylinderCollider args={[0.12, 1.05]} position={[0, 0.68, 0]} />
      </RigidBody>
      <RigidBody type="fixed" colliders={false}>
        <CylinderCollider args={[0.3, 0.28]} position={[0, 0.3, 0]} />
      </RigidBody>
      <mesh geometry={GEO.cyl()} material={envMat('ivory')} position-y={0.3} scale={[0.34, 0.6, 0.34]} castShadow />
      <group ref={cap} position-y={0.58}>
        <mesh geometry={GEO.sphere()} material={capMat} scale={[1.15, 0.6, 1.15]} position-y={0.05} castShadow />
        {spots.map((p, i) => <mesh key={i} geometry={GEO.sphereLo()} material={envMat('ivory')} position={p} scale={[0.17, 0.08, 0.17]} />)}
      </group>
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Festive bunting between two points (static, batched).               */
/* ------------------------------------------------------------------ */

const FLAG_COLS = ['#ff4f5e', '#ffd23a', '#22c7d6', '#ff9a1f', '#8dff9a', '#ff7ad9', '#ffffff']

export function Bunting({ a, b, sag = 0.9, n }: { a: V3; b: V3; sag?: number; n?: number }) {
  const geo = useMemo(() => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b)
    const len = A.distanceTo(B)
    const count = n ?? Math.max(4, Math.round(len / 0.75))
    const pos: number[] = []
    const col: number[] = []
    const c = new THREE.Color()
    const at = (t: number) => new THREE.Vector3().lerpVectors(A, B, t).add(new THREE.Vector3(0, -Math.sin(t * Math.PI) * sag, 0))
    const side = new THREE.Vector3().subVectors(B, A).normalize()
    for (let i = 0; i < count; i++) {
      const t0 = (i + 0.15) / count, t1 = (i + 0.85) / count
      const p0 = at(t0), p1 = at(t1)
      const tip = at((t0 + t1) / 2).add(new THREE.Vector3(0, -0.42, 0)).addScaledVector(side, 0)
      pos.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, tip.x, tip.y, tip.z)
      c.set(FLAG_COLS[i % FLAG_COLS.length])
      for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b)
    }
    // The string itself: thin quads.
    for (let i = 0; i < 24; i++) {
      const p0 = at(i / 24), p1 = at((i + 1) / 24)
      const d = 0.025
      pos.push(p0.x, p0.y + d, p0.z, p1.x, p1.y + d, p1.z, p1.x, p1.y - d, p1.z)
      pos.push(p0.x, p0.y + d, p0.z, p1.x, p1.y - d, p1.z, p0.x, p0.y - d, p0.z)
      for (let k = 0; k < 6; k++) col.push(0.2, 0.2, 0.24)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    g.computeVertexNormals()
    return g
  }, [a, b, sag, n])
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 }), [])
  return <mesh geometry={geo} material={mat} castShadow />
}

/** Pole for bunting (decor only). */
export function Pole({ pos, h = 4.2, color = '#ff4f5e' }: { pos: V3; h?: number; color?: string }) {
  return (
    <group position={pos} userData={{ batch: true }}>
      <mesh geometry={GEO.cyl()} material={envMat('dark')} position-y={h / 2} scale={[0.08, h, 0.08]} castShadow />
      <mesh geometry={GEO.sphereLo()} material={envMat(color)} position-y={h + 0.1} scale={0.16} />
    </group>
  )
}

/** Little "score board" sign for the goal. */
export function GoalBoard({ id, pos, rotY = 0 }: { id: string; pos: V3; rotY?: number }) {
  void worldBox
  void MINI
  const el = useRef<THREE.Mesh>(null!)
  const tex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 256
    c.height = 128
    return { c, t: new THREE.CanvasTexture(c), last: -1 }
  }, [])
  useFrame(() => {
    const n = (G.vars[`goals:${id}`] as number) ?? 0
    if (n === tex.last) return
    tex.last = n
    const g = tex.c.getContext('2d')!
    g.fillStyle = '#1b2433'
    g.fillRect(0, 0, 256, 128)
    g.fillStyle = '#ffd23a'
    g.font = 'bold 30px Fredoka, sans-serif'
    g.textAlign = 'center'
    g.fillText('GOLES', 128, 40)
    g.fillStyle = '#ffffff'
    g.font = 'bold 64px Fredoka, sans-serif'
    g.fillText(String(n), 128, 108)
    tex.t.colorSpace = THREE.SRGBColorSpace
    tex.t.needsUpdate = true
  })
  return (
    <group position={pos} rotation-y={rotY}>
      <mesh geometry={GEO.cyl()} material={envMat('dark')} position-y={0.9} scale={[0.07, 1.8, 0.07]} />
      <mesh ref={el} position-y={2.1}><planeGeometry args={[1.3, 0.65]} /><meshBasicMaterial map={tex.t} toneMapped={false} side={THREE.DoubleSide} /></mesh>
    </group>
  )
}
