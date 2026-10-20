import { useMemo } from 'react'
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { grassTex, hazardTex, metalTex, plateTex, strataTex, woodTex, padTex } from './textures'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export type V3 = [number, number, number]

const matCache = new Map<string, THREE.Material>()
export function envMat(kind: string): THREE.MeshStandardMaterial {
  let m = matCache.get(kind)
  if (m) return m as THREE.MeshStandardMaterial
  switch (kind) {
    case 'rock': m = new THREE.MeshStandardMaterial({ map: strataTex(), roughness: 0.92, color: '#d9b49e' }); break
    case 'grass': m = new THREE.MeshStandardMaterial({ map: grassTex(), roughness: 1, color: '#b9cf8e' }); break
    case 'metal': m = new THREE.MeshStandardMaterial({ map: metalTex(), roughness: 0.55, metalness: 0.55, color: '#ffffff' }); break
    case 'plate': m = new THREE.MeshStandardMaterial({ map: plateTex(), roughness: 0.45, metalness: 0.6, color: '#ffffff' }); break
    case 'wood': m = new THREE.MeshStandardMaterial({ map: woodTex(), roughness: 0.8, color: '#ffffff' }); break
    case 'hazard': m = new THREE.MeshStandardMaterial({ map: hazardTex(), roughness: 0.6, color: '#ffffff' }); break
    case 'pad': m = new THREE.MeshStandardMaterial({ map: padTex(), roughness: 0.7, color: '#ffffff' }); break
    case 'dark': m = new THREE.MeshStandardMaterial({ color: '#363a43', roughness: 0.5, metalness: 0.6 }); break
    case 'yellow': m = new THREE.MeshStandardMaterial({ color: '#f2b51d', roughness: 0.45, metalness: 0.3 }); break
    case 'orange': m = new THREE.MeshStandardMaterial({ color: '#e8742a', roughness: 0.5, metalness: 0.2 }); break
    case 'teal': m = new THREE.MeshStandardMaterial({ color: '#2aa7b5', roughness: 0.5, metalness: 0.2 }); break
    case 'ivory': m = new THREE.MeshStandardMaterial({ color: '#efe4cc', roughness: 0.5 }); break
    case 'leaf': m = new THREE.MeshStandardMaterial({ color: '#6c9a35', roughness: 0.9, flatShading: true }); break
    case 'trunk': m = new THREE.MeshStandardMaterial({ color: '#6b4a2e', roughness: 0.9 }); break
    case 'cloth': m = new THREE.MeshStandardMaterial({ color: '#f2b51d', roughness: 0.9, side: THREE.DoubleSide }); break
    case 'glass': m = new THREE.MeshStandardMaterial({ color: '#9fe8ff', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.35 }); break
    default: m = new THREE.MeshStandardMaterial({ color: kind })
  }
  matCache.set(kind, m)
  return m as THREE.MeshStandardMaterial
}

/** Box geometry whose UVs are in world metres (1 tile = `tile` m), so textures never stretch. */
const boxCache = new Map<string, THREE.BufferGeometry>()
export function worldBox(w: number, h: number, d: number, tile = 4) {
  const key = `${w}|${h}|${d}|${tile}`
  let g = boxCache.get(key)
  if (g) return g
  g = new THREE.BoxGeometry(w, h, d)
  const uv = g.attributes.uv as THREE.BufferAttribute
  const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k
    uv.setXY(i, (uv.getX(i) * dims[f][0]) / tile, (uv.getY(i) * dims[f][1]) / tile)
  }
  boxCache.set(key, g)
  return g
}

export interface BlockProps {
  pos: V3 // top-centre of the walkable surface
  size: V3 // width (x), height (y), depth (z)
  kind?: 'rock' | 'metal' | 'wood' | 'plate'
  grass?: boolean
  rotY?: number
  ud?: Record<string, any>
  trim?: boolean
  tufts?: number
  noCollide?: boolean
}

/** The workhorse level piece: rock / metal / wood slab with a grassy top. */
export function Block({ pos, size, kind = 'rock', grass = kind === 'rock', rotY = 0, ud, trim = kind === 'rock', tufts, noCollide }: BlockProps) {
  const [w, h, d] = size
  const body = useMemo(() => worldBox(w, h, d, kind === 'rock' ? 5 : 2), [w, h, d, kind])
  const tuftGeo = useMemo(() => (grass ? makeTufts(w, d, tufts ?? Math.min(60, Math.floor(w * d * 0.6))) : null), [grass, w, d, tufts])
  const lip = useMemo(() => (grass ? makeGrassLip(w, d) : null), [grass, w, d])
  const content = (
    <group userData={{ batch: true }}>
      <mesh geometry={body} material={envMat(kind)} position-y={-h / 2} castShadow receiveShadow />
      {grass && <mesh geometry={worldBox(w + 0.12, 0.16, d + 0.12, 3)} material={envMat('grass')} position-y={-0.06} receiveShadow />}
      {lip && <mesh geometry={lip} material={envMat('grass')} position-y={-0.05} castShadow />}
      {tuftGeo && <mesh geometry={tuftGeo} material={envMat('leaf')} position-y={0.08} castShadow />}
      {trim && h > 1 && (
        <>
          {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
            <mesh key={i} geometry={worldBox(0.18, Math.min(h, 2.2), 0.5)} material={envMat('dark')} position={[sx * (w / 2 + 0.04), -Math.min(h, 2.2) / 2 - 0.1, sz * (d / 2 - 0.6)]} castShadow />
          ))}
        </>
      )}
    </group>
  )
  if (noCollide) return <group position={pos} rotation-y={rotY}>{content}</group>
  return (
    <RigidBody type="fixed" position={pos} rotation-y={rotY} colliders={false} userData={ud}>
      <CuboidCollider args={[w / 2, h / 2, d / 2]} position={[0, -h / 2, 0]} friction={0.8} />
      {content}
    </RigidBody>
  )
}

function makeTufts(w: number, d: number, n: number) {
  let s = Math.floor(w * 131 + d * 17) || 3
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647 }
  const gs: THREE.BufferGeometry[] = []
  for (let i = 0; i < n; i++) {
    // Tufts hug the edges, leaving the walkable middle readable.
    const edge = r()
    let x: number, z: number
    if (edge < 0.5) { x = (r() - 0.5) * w * 0.96; z = (r() < 0.5 ? -1 : 1) * (d / 2 - r() * 0.7) }
    else { z = (r() - 0.5) * d * 0.96; x = (r() < 0.5 ? -1 : 1) * (w / 2 - r() * 0.7) }
    const g = new THREE.ConeGeometry(0.12 + r() * 0.12, 0.25 + r() * 0.35, 4)
    g.rotateZ((r() - 0.5) * 0.5)
    g.translate(x, 0.12, z)
    gs.push(g)
  }
  return gs.length ? mergeGeometries(gs) : null
}

function makeGrassLip(w: number, d: number) {
  let s = Math.floor(w * 7 + d * 3) || 5
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647 }
  const gs: THREE.BufferGeometry[] = []
  const per = 1.1
  const add = (x: number, z: number) => {
    const g = new THREE.SphereGeometry(0.22 + r() * 0.16, 6, 4)
    g.scale(1.3, 0.55, 1.3)
    g.translate(x, -0.02, z)
    gs.push(g)
  }
  for (let x = -w / 2; x <= w / 2; x += per) { add(x, -d / 2); add(x, d / 2) }
  for (let z = -d / 2 + per; z < d / 2; z += per) { add(-w / 2, z); add(w / 2, z) }
  return mergeGeometries(gs)
}

/** Cylindrical rock pillar (supports, decorative columns). */
export function Pillar({ pos, radius, height, collide = true }: { pos: V3; radius: number; height: number; collide?: boolean }) {
  const geo = useMemo(() => {
    const g = new THREE.CylinderGeometry(radius * 0.9, radius * 1.1, height, 9, 3)
    const uv = g.attributes.uv as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * radius * 1.2, uv.getY(i) * height / 5)
    return g
  }, [radius, height])
  const mesh = <mesh geometry={geo} material={envMat('rock')} position-y={-height / 2} castShadow receiveShadow userData={{ batch: true }} />
  if (!collide) return <group position={pos}>{mesh}</group>
  return (
    <RigidBody type="fixed" position={pos} colliders={false}>
      <CylinderCollider args={[height / 2, radius]} position={[0, -height / 2, 0]} />
      {mesh}
    </RigidBody>
  )
}

/** Stylised tree like the ones topping the mesas. */
export function Tree({ pos, s = 1 }: { pos: V3; s?: number }) {
  return (
    <group position={pos} scale={s} userData={{ batch: true }}>
      <mesh material={envMat('trunk')} position-y={1} castShadow><cylinderGeometry args={[0.12, 0.2, 2, 6]} /></mesh>
      <mesh material={envMat('leaf')} position-y={2.3} castShadow><icosahedronGeometry args={[1.1, 0]} /></mesh>
      <mesh material={envMat('leaf')} position={[0.6, 2.0, 0.2]} castShadow><icosahedronGeometry args={[0.7, 0]} /></mesh>
      <mesh material={envMat('leaf')} position={[-0.5, 2.1, -0.3]} castShadow><icosahedronGeometry args={[0.75, 0]} /></mesh>
    </group>
  )
}

/** Industrial scaffold with yellow rails (background structure that also frames rooms). */
export function Scaffold({ pos, w = 4, d = 4, h = 8, rotY = 0 }: { pos: V3; w?: number; d?: number; h?: number; rotY?: number }) {
  const geo = useMemo(() => {
    const gs: THREE.BufferGeometry[] = []
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const g = new THREE.BoxGeometry(0.22, h, 0.22); g.translate((x * w) / 2, h / 2, (z * d) / 2); gs.push(g) }
    for (let y = 2; y < h; y += 2.5) {
      for (const [x, z, sx, sz] of [[0, -1, w, 0.12], [0, 1, w, 0.12], [-1, 0, 0.12, d], [1, 0, 0.12, d]]) { const g = new THREE.BoxGeometry(sx || 0.12, 0.12, sz || 0.12); g.translate((x * w) / 2, y, (z * d) / 2); gs.push(g) }
      const diag = new THREE.BoxGeometry(0.08, Math.hypot(w, 2.5), 0.08)
      diag.rotateZ(Math.atan2(w, 2.5))
      diag.translate(0, y - 1.25, d / 2)
      gs.push(diag)
    }
    return mergeGeometries(gs)
  }, [w, d, h])
  return (
    <group position={pos} rotation-y={rotY} userData={{ batch: true }}>
      <mesh geometry={geo} material={envMat('dark')} castShadow />
      <mesh geometry={worldBox(w + 0.4, 0.25, d + 0.4)} material={envMat('yellow')} position-y={h} castShadow />
    </group>
  )
}

/** Hanging yellow banner with the company chevron. */
export function Banner({ pos, rotY = 0, color = '#f2b51d' }: { pos: V3; rotY?: number; color?: string }) {
  const tex = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 128; c.height = 256
    const g = c.getContext('2d')!
    g.fillStyle = color; g.fillRect(0, 0, 128, 256)
    g.fillStyle = 'rgba(255,255,255,0.85)'
    g.beginPath(); g.moveTo(30, 150); g.lineTo(64, 90); g.lineTo(98, 150); g.lineTo(84, 150); g.lineTo(64, 115); g.lineTo(44, 150); g.fill()
    g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(0, 0, 128, 10)
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t
  }, [color])
  return (
    <group position={pos} rotation-y={rotY} userData={{ batch: true }}>
      <mesh material={envMat('dark')} position-y={0.05}><boxGeometry args={[1.5, 0.1, 0.1]} /></mesh>
      <mesh position-y={-1.1}><planeGeometry args={[1.3, 2.2]} /><meshStandardMaterial map={tex} side={THREE.DoubleSide} roughness={0.9} /></mesh>
    </group>
  )
}

export function HazardStrip({ pos, size, rotY = 0 }: { pos: V3; size: [number, number]; rotY?: number }) {
  return (
    <mesh position={pos} rotation={[-Math.PI / 2, 0, rotY]} receiveShadow material={envMat('hazard')} userData={{ batch: true }}>
      <planeGeometry args={size} />
    </mesh>
  )
}
