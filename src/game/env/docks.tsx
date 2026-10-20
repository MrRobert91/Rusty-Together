import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { G, fx } from '../runtime'
import { usePerf } from '../../core/device'
import { envMat, worldBox, type V3 } from './blocks'
import { GEO, M } from '../robots/materials'
import { blimpTex, edgeTex } from './textures'
import { cargoMat } from './hazards'

/*
 * Dock kit for «Muelles de rebote»: containers, fenders, bollards, lamps,
 * pipes, flags, cranes that keep working, airships and gulls. Static props
 * are tagged for the static batcher; moving ones share materials and are
 * kept cheap (one draw call per part, instancing for flocks).
 */

export const CARGO = ['#c8372d', '#2a7fc0', '#e8742a', '#3f8f4e', '#d9b02a'] as const

const seeded = (seed: number) => {
  let s = seed % 2147483647 || 7
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647 }
}

/* ------------------------------------------------------------ Containers */

export function Container({ pos, rotY = 0, color = CARGO[0], size = [2.6, 1.3, 1.3], collide = true }: { pos: V3; rotY?: number; color?: string; size?: V3; collide?: boolean }) {
  const [w, h, d] = size
  const mesh = (
    <group userData={{ batch: true }}>
      <mesh geometry={GEO.box()} material={cargoMat(color)} scale={size} position-y={h / 2} castShadow receiveShadow />
      {/* Door bars on the end */}
      {[-0.25, 0.25].map((z) => <mesh key={z} geometry={GEO.cyl()} material={envMat('dark')} scale={[0.03, h * 0.86, 0.03]} position={[w / 2 + 0.02, h / 2, z * d]} />)}
    </group>
  )
  if (!collide) return <group position={pos} rotation-y={rotY}>{mesh}</group>
  return (
    <RigidBody type="fixed" position={pos} rotation-y={rotY} colliders={false}>
      <CuboidCollider args={[w / 2, h / 2, d / 2]} position={[0, h / 2, 0]} />
      {mesh}
    </RigidBody>
  )
}

/** A believable pile of containers: two-three layers, slightly offset. */
export function CargoStack({ pos, rotY = 0, cols = 2, layers = 2, seed = 1, collide = true }: { pos: V3; rotY?: number; cols?: number; layers?: number; seed?: number; collide?: boolean }) {
  const items = useMemo(() => {
    const r = seeded(seed * 977 + 13)
    const out: { p: V3; c: string; ry: number }[] = []
    for (let L = 0; L < layers; L++) {
      const n = Math.max(1, cols - (L > 0 && r() < 0.5 ? 1 : 0))
      for (let i = 0; i < n; i++) {
        out.push({ p: [(r() - 0.5) * 0.25, L * 1.3, (i - (n - 1) / 2) * 1.36 + (L ? (r() - 0.5) * 0.4 : 0)], c: CARGO[Math.floor(r() * CARGO.length)], ry: (r() - 0.5) * (L ? 0.12 : 0.04) })
      }
    }
    return out
  }, [cols, layers, seed])
  return (
    <group position={pos} rotation-y={rotY}>
      {items.map((it, i) => <Container key={i} pos={it.p} rotY={it.ry} color={it.c} collide={collide} />)}
    </group>
  )
}

/* ------------------------------------------------------------ Small props */

/** Rubber tyre fenders hanging along a deck edge. */
export function Fenders({ pos, rotY = 0, count = 3, spacing = 1.6 }: { pos: V3; rotY?: number; count?: number; spacing?: number }) {
  return (
    <group position={pos} rotation-y={rotY} userData={{ batch: true }}>
      {Array.from({ length: count }, (_, i) => {
        const x = (i - (count - 1) / 2) * spacing
        return (
          <group key={i} position-x={x}>
            <mesh geometry={tyreGeo()} material={M.dark()} position={[0, -0.75, 0.22]} castShadow />
            <mesh geometry={GEO.cyl()} material={envMat('trunk')} scale={[0.025, 0.5, 0.025]} position={[0, -0.25, 0.22]} />
          </group>
        )
      })}
    </group>
  )
}
let _tyre: THREE.BufferGeometry | null = null
function tyreGeo() {
  if (!_tyre) { _tyre = new THREE.TorusGeometry(0.42, 0.17, 10, 22) }
  return _tyre
}

export function Bollard({ pos }: { pos: V3 }) {
  return (
    <group position={pos} userData={{ batch: true }}>
      <mesh geometry={GEO.cyl()} material={envMat('dark')} scale={[0.2, 0.55, 0.2]} position-y={0.27} castShadow />
      <mesh geometry={GEO.sphereLo()} material={envMat('yellow')} scale={[0.27, 0.14, 0.27]} position-y={0.58} castShadow />
      <mesh geometry={GEO.torus()} material={envMat('trunk')} scale={[0.24, 0.24, 0.6]} rotation-x={Math.PI / 2} position-y={0.36} />
    </group>
  )
}

/** Street lamp; the bulb glows (bloom picks it up). */
export function LampPost({ pos, rotY = 0, h = 3.6 }: { pos: V3; rotY?: number; h?: number }) {
  return (
    <group position={pos} rotation-y={rotY} userData={{ batch: true }}>
      <mesh geometry={GEO.cyl()} material={envMat('dark')} scale={[0.25, 0.2, 0.25]} position-y={0.1} />
      <mesh geometry={GEO.cyl()} material={envMat('dark')} scale={[0.07, h, 0.07]} position-y={h / 2} castShadow />
      <mesh geometry={worldBox(0.08, 0.08, 0.9, 1)} material={envMat('dark')} position={[0, h - 0.05, 0.4]} />
      <mesh geometry={GEO.cone()} material={envMat('yellow')} scale={[0.32, 0.25, 0.32]} position={[0, h - 0.18, 0.82]} castShadow />
      <mesh geometry={GEO.sphereLo()} material={M.glow('#fff1c4', 2.6)} scale={0.15} position={[0, h - 0.32, 0.82]} />
    </group>
  )
}

/** Painted chevron edge along a deck border. */
export function HazardEdge({ pos, len, rotY = 0 }: { pos: V3; len: number; rotY?: number }) {
  const mat = useMemo(() => {
    const t = edgeTex().clone()
    t.needsUpdate = true
    t.wrapS = THREE.RepeatWrapping
    t.repeat.set(Math.max(1, Math.round(len / 1.6)), 1)
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, metalness: 0.2 })
  }, [len])
  return (
    <group position={pos} rotation-y={rotY} userData={{ batch: true }}>
      <mesh material={mat} position-y={-0.2} castShadow>
        <boxGeometry args={[len, 0.42, 0.14]} />
      </mesh>
    </group>
  )
}

/** Pipe run with flanges and a red valve wheel, bolted to a wall face. */
export function Pipes({ pos, len, rotY = 0, color = '#c8372d' }: { pos: V3; len: number; rotY?: number; color?: string }) {
  const geo = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.16, 0.16, len, 12)
    g.rotateZ(Math.PI / 2)
    return g
  }, [len])
  return (
    <group position={pos} rotation-y={rotY} userData={{ batch: true }}>
      <mesh geometry={geo} material={M.accent(color)} castShadow />
      <mesh geometry={geo} material={envMat('dark')} scale={[1, 0.7, 0.7]} position={[0, -0.42, 0.04]} />
      {Array.from({ length: Math.floor(len / 2) + 1 }, (_, i) => (
        <mesh key={i} geometry={GEO.cyl()} material={envMat('dark')} rotation-z={Math.PI / 2} scale={[0.22, 0.1, 0.22]} position-x={-len / 2 + i * 2} />
      ))}
      <mesh geometry={GEO.torus()} material={M.accent('#e8483b')} scale={0.28} position={[len * 0.2, 0.36, 0.05]} />
      <mesh geometry={GEO.cyl()} material={envMat('dark')} scale={[0.04, 0.3, 0.04]} position={[len * 0.2, 0.2, 0.05]} />
    </group>
  )
}

/* ------------------------------------------------------------ Wind things */

/** Cloth flag: a plane deformed on the CPU (cheap at this vertex count). */
export function Flag({ pos, color = '#ff9a1f', h = 4, rotY = 0 }: { pos: V3; color?: string; h?: number; rotY?: number }) {
  const cloth = useRef<THREE.Mesh>(null!)
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(1.5, 0.9, 12, 4)
    g.translate(0.75, 0, 0)
    return g
  }, [])
  const base = useMemo(() => Float32Array.from(geo.attributes.position.array as Float32Array), [geo])
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.85 }), [color])
  const off = useMemo(() => pos[0] * 0.37 + pos[2] * 0.11, [pos])
  useFrame(() => {
    const p = geo.attributes.position as THREE.BufferAttribute
    const t = G.time * 5 + off
    for (let i = 0; i < p.count; i++) {
      const x = base[i * 3]
      const y = base[i * 3 + 1]
      const k = x / 1.5
      p.setZ(i, Math.sin(t - x * 3.2 + y * 0.8) * 0.18 * k + Math.sin(t * 0.7 - x * 1.7) * 0.06 * k)
      p.setY(i, y - k * k * 0.12)
    }
    p.needsUpdate = true
    geo.computeVertexNormals()
    cloth.current.rotation.y = Math.sin(G.time * 0.4 + off) * 0.25
  })
  return (
    <group position={pos} rotation-y={rotY}>
      <group userData={{ batch: true }}>
        <mesh geometry={GEO.cyl()} material={envMat('dark')} scale={[0.05, h, 0.05]} position-y={h / 2} castShadow />
        <mesh geometry={GEO.sphereLo()} material={envMat('yellow')} scale={0.09} position-y={h + 0.05} />
      </group>
      <mesh ref={cloth} geometry={geo} material={mat} position-y={h - 0.5} castShadow />
    </group>
  )
}

/** Striped windsock that swings into the wind and breathes with the gusts. */
export function Windsock({ pos, rotY = 0 }: { pos: V3; rotY?: number }) {
  const sock = useRef<THREE.Group>(null!)
  const off = pos[0] + pos[2] * 0.3
  useFrame(() => {
    const t = G.time
    const gust = 0.5 + 0.5 * Math.sin(t * 0.6 + off) * Math.sin(t * 1.7 + off * 2)
    sock.current.rotation.y = Math.sin(t * 0.35 + off) * 0.5
    sock.current.rotation.z = -0.9 + gust * 0.75 + Math.sin(t * 7 + off) * 0.03
  })
  return (
    <group position={pos} rotation-y={rotY}>
      <group userData={{ batch: true }}>
        <mesh geometry={GEO.cyl()} material={envMat('dark')} scale={[0.06, 3.4, 0.06]} position-y={1.7} castShadow />
      </group>
      <group ref={sock} position-y={3.35}>
        {[0, 1, 2, 3, 4].map((i) => (
          <mesh key={i} geometry={sockSeg()} material={i % 2 ? M.accent('#efe4cc') : M.accent('#e8483b')} position-x={0.18 + i * 0.3} scale={[1, 1 - i * 0.12, 1 - i * 0.12]} castShadow />
        ))}
      </group>
    </group>
  )
}
let _sock: THREE.BufferGeometry | null = null
function sockSeg() {
  if (!_sock) { _sock = new THREE.CylinderGeometry(0.2, 0.2, 0.3, 12, 1, true); _sock.rotateZ(Math.PI / 2) }
  return _sock
}

/* ------------------------------------------------------------ Lattice */

/** Merged lattice column (crane towers, pylons). */
function latticeGeo(w: number, h: number, step = 1.6, t = 0.16) {
  const gs: THREE.BufferGeometry[] = []
  const b = t * 0.55
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const g = new THREE.BoxGeometry(t, h, t); g.translate((x * w) / 2, h / 2, (z * w) / 2); gs.push(g) }
  for (let y = step; y < h; y += step) {
    for (const [x, z, sx, sz] of [[0, -1, w, b], [0, 1, w, b], [-1, 0, b, w], [1, 0, b, w]]) { const g = new THREE.BoxGeometry(sx, b, sz); g.translate((x * w) / 2, y, (z * w) / 2); gs.push(g) }
    for (const s of [-1, 1]) {
      const d = new THREE.BoxGeometry(b * 0.8, Math.hypot(w, step), b * 0.8)
      d.rotateZ(Math.atan2(w, step) * s)
      d.translate(0, y - step / 2, (s * w) / 2)
      gs.push(d)
      const e = new THREE.BoxGeometry(b * 0.8, Math.hypot(w, step), b * 0.8)
      e.rotateX(Math.atan2(w, step) * s)
      e.translate((s * w) / 2, y - step / 2, 0)
      gs.push(e)
    }
  }
  return mergeGeometries(gs)!
}

/* ------------------------------------------------------------ Dock crane */

/**
 * A working tower crane: the jib slews back and forth, the trolley runs out
 * and back, and the container on the hook swings with real pendulum lag.
 */
export function DockCrane({ pos, h = 18, jib = 14, rotY = 0, phase = 0, color = CARGO[1], slew = 1.1, period = 16 }: { pos: V3; h?: number; jib?: number; rotY?: number; phase?: number; color?: string; slew?: number; period?: number }) {
  const top = useRef<THREE.Group>(null!)
  const trolley = useRef<THREE.Group>(null!)
  const load = useRef<THREE.Group>(null!)
  const cable = useRef<THREE.Mesh>(null!)
  const tower = useMemo(() => latticeGeo(2, h, 2, 0.34), [h])
  const jibGeo = useMemo(() => {
    const g = latticeGeo(1.2, jib + 5, 1.6, 0.26)
    g.rotateZ(-Math.PI / 2)
    g.translate(-5, 0, 0)
    return g
  }, [jib])
  const sw = useRef({ ang: 0, vel: 0 })
  useFrame((_, dt) => {
    const t = G.time / period * Math.PI * 2 + phase
    // Smooth slew with eased ends (cranes do not snap).
    const yaw = Math.sin(t) * slew
    top.current.rotation.y = yaw
    const out = 4 + (jib - 5) * (0.5 + 0.5 * Math.sin(t * 2 + 0.6))
    const prev = trolley.current.position.x
    trolley.current.position.x = out
    // Load sways in reaction to trolley acceleration and slew.
    const s = sw.current
    const acc = (out - prev) / Math.max(dt, 1e-3)
    s.vel += (-s.ang * 2.2 - acc * 0.06 - s.vel * 0.6) * Math.min(dt, 0.05)
    s.ang += s.vel * Math.min(dt, 0.05) * 3
    load.current.rotation.z = s.ang * 0.6
    load.current.rotation.x = Math.sin(G.time * 0.9 + phase) * 0.06
    const drop = 5.5 + Math.sin(t * 2 + 2.2) * 2.2
    load.current.position.y = -drop
    cable.current.scale.y = drop - 0.8
    cable.current.position.y = -(drop - 0.8) / 2
  })
  return (
    <group position={pos} rotation-y={rotY}>
      <group userData={{ batch: true }}>
        <mesh geometry={worldBox(4, 1.2, 4, 2)} material={envMat('dark')} position-y={0.6} castShadow />
        <mesh geometry={tower} material={envMat('yellow')} position-y={1.2} castShadow />
      </group>
      <group ref={top} position-y={h + 1.2}>
        <mesh geometry={jibGeo} material={envMat('yellow')} castShadow />
        {/* Cab and counterweight */}
        <mesh geometry={worldBox(1.8, 1.6, 1.8, 1)} material={M.accent('#efe4cc')} position={[0.4, -0.6, 1.3]} castShadow />
        <mesh geometry={worldBox(1.6, 0.6, 0.1, 1)} material={envMat('glass')} position={[0.4, -0.4, 2.22]} />
        <mesh geometry={worldBox(2.6, 1.6, 1.6, 1)} material={envMat('dark')} position={[-4.4, -0.3, 0]} castShadow />
        <mesh geometry={GEO.cone()} material={envMat('yellow')} scale={[0.7, 3.2, 0.7]} position-y={2.1} />
        <mesh geometry={GEO.sphereLo()} material={M.glow('#ff3b2f', 3)} scale={0.16} position={[jib, 0.7, 0]} />
        <group ref={trolley} position={[8, -0.4, 0]}>
          <mesh geometry={worldBox(1, 0.4, 1.2, 1)} material={envMat('dark')} />
          <mesh ref={cable} geometry={GEO.cyl()} material={envMat('dark')} scale={[0.04, 1, 0.04]} />
          <group ref={load}>
            <mesh geometry={GEO.rbox(1, 1, 1, 0.2)} material={M.accent('#f2b51d')} scale={[0.5, 0.35, 0.5]} position-y={0.6} />
            <mesh geometry={GEO.box()} material={cargoMat(color)} scale={[2.6, 1.3, 1.3]} castShadow />
          </group>
        </group>
      </group>
    </group>
  )
}

/* ------------------------------------------------------------ Cargo line */

/** Cable-car of crates gliding between two pylons, forever late. */
export function CargoLine({ a, b, count = 4, speed = 2.2 }: { a: V3; b: V3; count?: number; speed?: number }) {
  const A = useMemo(() => new THREE.Vector3(...a), [a])
  const B = useMemo(() => new THREE.Vector3(...b), [b])
  const len = A.distanceTo(B)
  const cars = useRef<THREE.Group[]>([])
  const cableGeo = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.03, 0.03, len, 6)
    g.rotateX(Math.PI / 2)
    return g
  }, [len])
  const mid = useMemo(() => A.clone().lerp(B, 0.5), [A, B])
  const yaw = Math.atan2(B.x - A.x, B.z - A.z)
  const pitch = -Math.asin((B.y - A.y) / len)
  const pylon = useMemo(() => latticeGeo(1.2, 40, 2.4, 0.3), [])
  useFrame(() => {
    for (let i = 0; i < count; i++) {
      const g = cars.current[i]
      if (!g) continue
      const k = ((G.time * speed) / len + i / count) % 1
      g.position.lerpVectors(A, B, k)
      g.rotation.z = Math.sin(G.time * 1.3 + i * 2) * 0.05
    }
  })
  return (
    <group>
      <group userData={{ batch: true }}>
        <mesh geometry={cableGeo} material={envMat('dark')} position={mid} rotation={[pitch, yaw, 0, 'YXZ']} />
        {[A, B].map((p, i) => (
          <mesh key={i} geometry={pylon} material={envMat('yellow')} position={[p.x, p.y - 40, p.z]} />
        ))}
      </group>
      {Array.from({ length: count }, (_, i) => (
        <group key={i} ref={(g) => { if (g) cars.current[i] = g }} rotation-y={yaw}>
          <mesh geometry={GEO.cyl()} material={envMat('dark')} scale={[0.04, 1.2, 0.04]} position-y={-0.6} />
          <mesh geometry={GEO.box()} material={cargoMat(CARGO[i % CARGO.length])} scale={[1.3, 1.1, 2.2]} position-y={-1.75} castShadow />
        </group>
      ))}
    </group>
  )
}

/* ------------------------------------------------------------ Airships */

export function Airship({ center, rx, rz, y, speed = 0.04, phase = 0, scale = 1 }: { center: [number, number]; rx: number; rz: number; y: number; speed?: number; phase?: number; scale?: number }) {
  const g = useRef<THREE.Group>(null!)
  const props = useRef<THREE.Group[]>([])
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ map: blimpTex(), roughness: 0.6 }), [])
  const env = useMemo(() => {
    const geo = new THREE.SphereGeometry(1, 32, 16)
    geo.rotateZ(Math.PI / 2)
    return geo
  }, [])
  useFrame(() => {
    const t = G.time * speed + phase
    const x = center[0] + Math.cos(t) * rx
    const z = center[1] + Math.sin(t) * rz
    g.current.position.set(x, y + Math.sin(G.time * 0.3 + phase) * 1.2, z)
    // Face along the path (derivative of the ellipse).
    g.current.rotation.y = Math.atan2(-Math.sin(t) * rx, Math.cos(t) * rz) - Math.PI / 2
    g.current.rotation.z = Math.sin(G.time * 0.5 + phase) * 0.03
    for (const p of props.current) if (p) p.rotation.x = G.time * 14
  })
  return (
    <group ref={g} scale={scale}>
      <mesh geometry={env} material={mat} scale={[9, 3, 3]} castShadow />
      {[[0, 1], [0, -1], [1, 0], [-1, 0]].map(([a, b], i) => (
        <mesh key={i} geometry={GEO.box()} material={M.accent('#e8572e')} position={[-7.6, a * 1.6, b * 1.6]} scale={[2.4, a ? 2 : 0.15, b ? 2 : 0.15]} castShadow />
      ))}
      <mesh geometry={GEO.rbox(1, 1, 1, 0.25)} material={M.accent('#2d3340')} scale={[3.4, 1.1, 1.3]} position-y={-3.2} castShadow />
      <mesh geometry={worldBox(3, 0.35, 1.36, 1)} material={envMat('glass')} position-y={-3.05} />
      {[-1, 1].map((s, i) => (
        <group key={s} position={[-1, -2.6, s * 1.9]}>
          <mesh geometry={GEO.cyl()} material={envMat('dark')} rotation-z={Math.PI / 2} scale={[0.25, 1, 0.25]} />
          <group ref={(p) => { if (p) props.current[i] = p }} position-x={-0.6}>
            <mesh geometry={GEO.box()} material={envMat('dark')} scale={[0.05, 1.6, 0.18]} />
            <mesh geometry={GEO.box()} material={envMat('dark')} scale={[0.05, 0.18, 1.6]} />
          </group>
        </group>
      ))}
      <mesh geometry={GEO.sphereLo()} material={M.glow('#ff3b2f', 3)} scale={0.25} position={[8.8, 0, 0]} />
    </group>
  )
}

/* ------------------------------------------------------------ Gulls */

/** Instanced flock circling the docks; wings flap by scaling the V. */
export function Gulls({ center, count = 14, radius = 18, y = 14 }: { center: V3; count?: number; radius?: number; y?: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null!)
  const geo = useMemo(() => {
    const shape: number[] = [
      // left wing
      0, 0, 0.18, -0.55, 0.12, -0.05, 0, 0, -0.18,
      // right wing
      0, 0, 0.18, 0, 0, -0.18, 0.55, 0.12, -0.05,
      // body
      0, -0.05, 0.3, -0.06, 0, -0.25, 0.06, 0, -0.25,
    ]
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(shape, 3))
    g.computeVertexNormals()
    return g
  }, [])
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f6f4ef', side: THREE.DoubleSide, roughness: 0.8 }), [])
  const birds = useMemo(() => {
    const r = seeded(Math.floor(center[2] * 7 + 31))
    return Array.from({ length: count }, () => ({ a: r() * Math.PI * 2, r: radius * (0.5 + r() * 0.7), h: y + (r() - 0.5) * 6, s: 0.25 + r() * 0.2, f: 7 + r() * 4, sz: 0.8 + r() * 0.5, dir: r() < 0.8 ? 1 : -1 }))
  }, [count, radius, y, center])
  const dummy = useMemo(() => new THREE.Object3D(), [])
  useFrame(() => {
    const m = mesh.current
    for (let i = 0; i < birds.length; i++) {
      const b = birds[i]
      const a = b.a + G.time * b.s * b.dir
      dummy.position.set(center[0] + Math.cos(a) * b.r, b.h + Math.sin(G.time * 0.7 + i) * 1.2, center[2] + Math.sin(a) * b.r)
      dummy.rotation.set(0, -a + (b.dir > 0 ? Math.PI : 0), Math.sin(G.time + i) * 0.3 * b.dir)
      const flap = Math.sin(G.time * b.f + i)
      dummy.scale.set(b.sz, b.sz * (0.2 + flap * 1.4), b.sz)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    }
    m.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={mesh} args={[geo, mat, birds.length]} frustumCulled={false} />
}

/* ------------------------------------------------------------ Steam vents */

/** A grate that exhales a puff every few seconds (local effect only). */
export function SteamVent({ pos, every = 3.2, offset = 0 }: { pos: V3; every?: number; offset?: number }) {
  const st = useRef({ n: -1 })
  const lowTier = usePerf((s) => s.tier) === 'low'
  useFrame(() => {
    if (lowTier) return
    const n = Math.floor((G.time + offset) / every)
    if (n !== st.current.n) {
      if (st.current.n >= 0 && camNear(pos, 40)) fx('particles', { n: 'poof', p: { x: pos[0], y: pos[1] + 0.2, z: pos[2] }, c: '#f4f7fb', s: 0.7 }, false)
      st.current.n = n
    }
  })
  return (
    <group position={pos} userData={{ batch: true }}>
      <mesh geometry={worldBox(1, 0.06, 1, 1)} material={envMat('dark')} position-y={0.03} receiveShadow />
      {[-0.3, -0.1, 0.1, 0.3].map((x) => <mesh key={x} geometry={worldBox(0.06, 0.08, 0.86, 1)} material={envMat('yellow')} position={[x, 0.05, 0]} />)}
    </group>
  )
}
const camNear = (p: V3, d: number) => Math.hypot(G.cam.target.x - p[0], G.cam.target.z - p[2]) < d

/* ------------------------------------------------------------ Skyline */

/**
 * Distant floating docks: decks on rock roots, container stacks, cranes and
 * beacons, all merged into a handful of draw calls. Frames the level the way
 * the GDD illustration does.
 */
export function DockSkyline({ cx, cz, inner, count = 22 }: { cx: number; cz: number; inner: number; count?: number }) {
  const parts = useMemo(() => {
    const r = seeded(4242)
    const deck: THREE.BufferGeometry[] = []
    const rock: THREE.BufferGeometry[] = []
    const yellow: THREE.BufferGeometry[] = []
    const dark: THREE.BufferGeometry[] = []
    const lamps: THREE.BufferGeometry[] = []
    const boxes: THREE.BufferGeometry[][] = CARGO.map(() => [])
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + r() * 0.2
      const rad = inner + 30 + r() * 120
      const x = cx + Math.cos(ang) * rad
      const z = cz + Math.sin(ang) * rad * 1.25
      const y = -6 + r() * 26
      const w = 14 + r() * 18
      const d = 10 + r() * 14
      // Deck slab and hazard lip.
      const slab = new THREE.BoxGeometry(w, 2.2, d); slab.translate(x, y - 1.1, z); deck.push(slab)
      const lip = new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6); lip.translate(x, y - 2.3, z); yellow.push(lip)
      // Rock root underneath.
      const H = 14 + r() * 16
      const root = new THREE.ConeGeometry(Math.min(w, d) * 0.55, H, 7, 3)
      root.rotateX(Math.PI)
      const rp = root.attributes.position as THREE.BufferAttribute
      for (let k = 0; k < rp.count; k++) rp.setX(k, rp.getX(k) * (1 + Math.sin(k * 1.7 + i) * 0.12))
      root.computeVertexNormals()
      root.translate(x, y - 2.2 - H / 2, z)
      rock.push(root)
      // Container stacks.
      const stacks = 2 + Math.floor(r() * 4)
      for (let s = 0; s < stacks; s++) {
        const sx = x + (r() - 0.5) * (w - 4)
        const sz = z + (r() - 0.5) * (d - 3)
        const layers = 1 + Math.floor(r() * 3)
        const rot = r() < 0.5 ? 0 : Math.PI / 2
        for (let L = 0; L < layers; L++) {
          const b = new THREE.BoxGeometry(2.6, 1.3, 1.3)
          b.rotateY(rot)
          b.translate(sx, y + 0.65 + L * 1.3, sz)
          boxes[Math.floor(r() * CARGO.length)].push(b)
        }
      }
      // A crane on most decks.
      if (r() < 0.7) {
        const ch = 9 + r() * 10
        const tw = latticeGeo(1.4, ch, 2.2, 0.4)
        tw.translate(x + (r() - 0.5) * w * 0.5, y, z + (r() - 0.5) * d * 0.5)
        yellow.push(tw)
        const jb = new THREE.BoxGeometry(12, 0.5, 0.6)
        jb.rotateY(r() * Math.PI)
        const tp = new THREE.Vector3(); tw.computeBoundingBox(); tw.boundingBox!.getCenter(tp)
        jb.translate(tp.x + 2, y + ch, tp.z)
        yellow.push(jb)
        const hook = new THREE.BoxGeometry(0.08, 4, 0.08); hook.translate(tp.x + 6, y + ch - 2, tp.z); dark.push(hook)
      }
      // Tower with beacon.
      if (r() < 0.5) {
        const th = 6 + r() * 12
        const t = new THREE.CylinderGeometry(1.2, 1.6, th, 8); t.translate(x - w * 0.3, y + th / 2, z + d * 0.25); dark.push(t)
        const cap = new THREE.CylinderGeometry(1.8, 1.4, 1.2, 8); cap.translate(x - w * 0.3, y + th + 0.6, z + d * 0.25); yellow.push(cap)
        const l = new THREE.SphereGeometry(0.5, 8, 6); l.translate(x - w * 0.3, y + th + 1.6, z + d * 0.25); lamps.push(l)
      }
    }
    const mg = (a: THREE.BufferGeometry[]) => (a.length ? mergeGeometries(a)! : null)
    return { deck: mg(deck), rock: mg(rock), yellow: mg(yellow), dark: mg(dark), lamps: mg(lamps), boxes: boxes.map(mg) }
  }, [cx, cz, inner, count])
  const boxMats = useMemo(() => CARGO.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, metalness: 0.2 })), [])
  return (
    <group>
      {parts.deck && <mesh geometry={parts.deck} material={envMat('metal')} />}
      {parts.rock && <mesh geometry={parts.rock} material={envMat('rock')} />}
      {parts.yellow && <mesh geometry={parts.yellow} material={envMat('yellow')} />}
      {parts.dark && <mesh geometry={parts.dark} material={envMat('dark')} />}
      {parts.lamps && <mesh geometry={parts.lamps} material={M.glow('#ff5a3a', 3)} />}
      {parts.boxes.map((g, i) => g && <mesh key={i} geometry={g} material={boxMats[i]} />)}
    </group>
  )
}
