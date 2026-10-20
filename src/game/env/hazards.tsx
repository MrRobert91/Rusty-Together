import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, CylinderCollider, RigidBody, useBeforePhysicsStep, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { G, isHost, localSlot, type Mini } from '../runtime'
import { applyHit } from '../robots/miniController'
import { sfx } from '../../core/audio'
import { BIG, MINI } from '../tuning'
import { envMat, worldBox, type V3 } from './blocks'
import { GEO, M } from '../robots/materials'
import { cargoTex } from './textures'
import { fx } from '../runtime'

/*
 * Moving hazards for the docks. Their motion is a pure function of the shared
 * host clock (G.time), so both peers see the same sweep without sending a
 * byte. Each peer only judges hits on the robots it simulates: its own mini
 * (and the solo bot), plus the joined body on the host. A hit is a padded
 * knock-back, never a kill: the robot is shoved, stunned briefly and gets
 * the usual knock protection.
 */

const tmp = new THREE.Vector3()
const tmp2 = new THREE.Vector3()
const q = new THREE.Quaternion()
const UP = new THREE.Vector3(0, 1, 0)

/** Minis this peer is responsible for. */
function ownMinis(): Mini[] {
  return G.minis.filter((m) => m.kind !== 'remote' && !m.hidden && !m.dead)
}

function knockBig(dir: THREE.Vector3, force: number) {
  const B = G.big
  if (!isHost() || !B.active || !B.body || B.dead || B.protectT > 0) return
  const v = B.body.linvel()
  B.body.setLinvel({ x: v.x + dir.x * force, y: Math.max(v.y, 0) + 5.5, z: v.z + dir.z * force }, true)
  B.stunT = 0.45
  B.launchedT = 0.45
  B.protectT = 1.4
  B.jumpT = G.time
  fx('sfx', { n: 'bonk', p: B.pos })
  fx('particles', { n: 'stars', p: { x: B.pos.x, y: B.pos.y + 1, z: B.pos.z } })
  fx('shake', { a: 0.35 })
}

function knockMini(m: Mini, dir: THREE.Vector3, force: number) {
  if (m.protectT > 0) return
  applyHit(m, { d: [dir.x, 0, dir.z], f: force })
  fx('sfx', { n: 'bonk', p: m.pos })
  fx('particles', { n: 'stars', p: { x: m.pos.x, y: m.pos.y + 0.4, z: m.pos.z } })
}

/** Closest point on segment ab to p (all XZ + Y). */
function closestOnSegment(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, out: THREE.Vector3) {
  tmp2.copy(b).sub(a)
  const len2 = tmp2.lengthSq()
  const k = len2 > 1e-6 ? THREE.MathUtils.clamp(tmp.copy(p).sub(a).dot(tmp2) / len2, 0, 1) : 0
  return out.copy(a).addScaledVector(tmp2, k)
}

/* ======================================================================== */
/* Sweeper: a padded boom that turns around a hub. Jump it, or get shoved.   */
/* ======================================================================== */

export interface SweeperProps {
  pos: V3 // floor point under the hub
  radius: number
  /** rad/s, sign gives the direction. */
  speed: number
  arms?: number
  /** Height of the boom's centre above the floor. */
  height?: number
  phase?: number
  force?: number
}

export function Sweeper({ pos, radius, speed, arms = 2, height = 0.42, phase = 0, force = 6.5 }: SweeperProps) {
  const body = useRef<RapierRigidBody>(null)
  const spin = useRef<THREE.Group>(null!)
  const lamp = useRef<THREE.Mesh>(null!)
  const st = useRef({ whoosh: -9 })
  const c = useMemo(() => new THREE.Vector3(...pos), [pos])
  const barR = 0.24
  const hubR = 0.7
  const armLen = radius - hubR
  const angleAt = (t: number) => phase + speed * t

  useBeforePhysicsStep(() => {
    const b = body.current
    if (!b) return
    q.setFromAxisAngle(UP, angleAt(G.time))
    b.setNextKinematicRotation(q)
  })

  const lampMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ff6a2a', emissive: '#ff4a12', emissiveIntensity: 2, toneMapped: false }), [])

  useFrame(() => {
    const ang = angleAt(G.time)
    spin.current.rotation.y = ang
    // Rotating beacon on the hub.
    lamp.current.rotation.y = G.time * 6
    lampMat.emissiveIntensity = 1.6 + Math.sin(G.time * 12) * 0.6

    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    const near = new THREE.Vector3()
    let closest = Infinity
    for (let k = 0; k < arms; k++) {
      const th = ang + (k * Math.PI * 2) / arms
      // Arm direction in world space (local +X rotated by th about Y).
      const dx = Math.cos(th)
      const dz = -Math.sin(th)
      a.set(c.x + dx * hubR, c.y + height, c.z + dz * hubR)
      b.set(c.x + dx * radius, c.y + height, c.z + dz * radius)
      // Tangential direction of travel at the tip.
      const tx = -Math.sin(th) * Math.sign(speed)
      const tz = -Math.cos(th) * Math.sign(speed)
      for (const m of ownMinis()) {
        const feet = m.pos.y - MINI.feet
        if (feet > c.y + height + barR + 0.05 || m.pos.y + 0.5 < c.y) continue
        closestOnSegment(tmp.set(m.pos.x, c.y + height, m.pos.z), a, b, near)
        const d = Math.hypot(m.pos.x - near.x, m.pos.z - near.z)
        if (m.slot === localSlot()) closest = Math.min(closest, d)
        if (d < MINI.radius + barR) {
          const out = tmp.set(m.pos.x - c.x, 0, m.pos.z - c.z).normalize()
          const dir = new THREE.Vector3(tx, 0, tz).multiplyScalar(0.8).addScaledVector(out, 0.45).normalize()
          knockMini(m, dir, force)
        }
      }
      const B = G.big
      if (isHost() && B.active && !B.dead) {
        const feet = B.pos.y - BIG.feet
        if (feet < c.y + height + barR && B.pos.y + 1 > c.y) {
          closestOnSegment(tmp.set(B.pos.x, c.y + height, B.pos.z), a, b, near)
          if (Math.hypot(B.pos.x - near.x, B.pos.z - near.z) < BIG.radius + barR) knockBig(tmp.set(tx, 0, tz), force * 0.8)
        }
      }
    }
    // A low whoosh as a boom passes close to you (audio cue, rate limited).
    if (closest < 2.2 && G.time - st.current.whoosh > 0.9) {
      st.current.whoosh = G.time
      sfx('whoosh', c, 0.55)
    }
  })

  const armGeo = useMemo(() => {
    const g = new THREE.CylinderGeometry(barR, barR, armLen, 16, 1)
    g.rotateZ(Math.PI / 2)
    g.translate(hubR + armLen / 2, 0, 0)
    return g
  }, [armLen])
  const stripeGeo = useMemo(() => {
    const g = new THREE.CylinderGeometry(barR + 0.012, barR + 0.012, 0.16, 16, 1, true)
    g.rotateZ(Math.PI / 2)
    return g
  }, [])

  return (
    <>
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={pos}>
      <CylinderCollider args={[0.75, hubR]} position={[0, 0.75, 0]} />
      {Array.from({ length: arms }, (_, k) => {
        const th = (k * Math.PI * 2) / arms
        return (
          <CuboidCollider key={k} args={[armLen / 2, barR, barR]} position={[Math.cos(th) * (hubR + armLen / 2), height, -Math.sin(th) * (hubR + armLen / 2)]} rotation={[0, th, 0]} />
        )
      })}
    </RigidBody>
    <group position={pos}>
      {/* Base: stepped drum, hazard ring on the floor marks the swept area. */}
      <group userData={{ batch: true }}>
        <mesh geometry={GEO.cyl()} material={envMat('dark')} scale={[hubR + 0.35, 0.14, hubR + 0.35]} position-y={0.07} receiveShadow />
        <mesh geometry={GEO.cyl()} material={envMat('yellow')} scale={[hubR + 0.12, 0.08, hubR + 0.12]} position-y={0.16} />
        <mesh geometry={sweepRingGeo(radius)} material={sweepRingMat()} rotation-x={-Math.PI / 2} position-y={0.025} receiveShadow />
      </group>
      <group ref={spin}>
        {/* Hub */}
        <mesh geometry={GEO.cyl()} material={M.accent('#f2b51d')} scale={[hubR, 1.1, hubR]} position-y={0.7} castShadow />
        <mesh geometry={GEO.cyl()} material={envMat('hazard')} scale={[hubR + 0.02, 0.32, hubR + 0.02]} position-y={0.95} />
        <mesh geometry={GEO.cyl()} material={envMat('dark')} scale={[hubR * 0.8, 0.18, hubR * 0.8]} position-y={1.32} castShadow />
        {[0, 1, 2, 3, 4, 5].map((k) => (
          <mesh key={k} geometry={GEO.sphereLo()} material={M.chrome()} scale={0.06} position={[Math.cos(k * 1.047) * hubR * 0.98, 0.45, Math.sin(k * 1.047) * hubR * 0.98]} />
        ))}
        {Array.from({ length: arms }, (_, k) => {
          const th = (k * Math.PI * 2) / arms
          return (
            <group key={k} rotation-y={th} position-y={height}>
              <mesh geometry={armGeo} material={M.accent('#e8742a')} castShadow />
              {Array.from({ length: Math.max(1, Math.floor(armLen / 0.7)) }, (_, j) => (
                <mesh key={j} geometry={stripeGeo} material={M.dark()} position-x={hubR + 0.45 + j * 0.7} />
              ))}
              {/* Rubber bumper tip with a warning light */}
              <mesh geometry={GEO.sphere()} material={M.dark()} scale={[0.34, 0.32, 0.32]} position-x={radius - 0.1} castShadow />
              <mesh geometry={GEO.sphereLo()} material={M.glow('#ff5a1a', 2.4)} scale={0.11} position={[radius + 0.18, 0.06, 0]} />
              {/* Brace to the hub top */}
              <mesh geometry={GEO.cyl()} material={envMat('dark')} scale={[0.05, armLen * 0.62, 0.05]} position={[hubR + armLen * 0.26, 0.55, 0]} rotation-z={1.0} />
            </group>
          )
        })}
      </group>
      {/* Rotating beacon */}
      <mesh ref={lamp} geometry={GEO.sphereLo()} material={lampMat} scale={[0.2, 0.14, 0.2]} position-y={1.5} />
    </group>
    </>
  )
}

const ringGeos = new Map<number, THREE.BufferGeometry>()
function sweepRingGeo(r: number) {
  let g = ringGeos.get(r)
  if (!g) { g = new THREE.RingGeometry(r - 0.22, r + 0.08, 72, 1); ringGeos.set(r, g) }
  return g
}
let _ringMat: THREE.Material | null = null
function sweepRingMat() {
  if (!_ringMat) _ringMat = new THREE.MeshStandardMaterial({ map: hazardRingTex(), roughness: 0.7, transparent: true, polygonOffset: true, polygonOffsetFactor: -2 })
  return _ringMat
}
let _hrt: THREE.Texture | null = null
function hazardRingTex() {
  if (_hrt) return _hrt
  const cv = document.createElement('canvas')
  cv.width = 512; cv.height = 32
  const g = cv.getContext('2d')!
  for (let x = 0; x < 512; x += 32) {
    g.fillStyle = '#f2b51d'; g.fillRect(x, 0, 16, 32)
    g.fillStyle = '#1d1f24'; g.fillRect(x + 16, 0, 16, 32)
  }
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = THREE.RepeatWrapping
  _hrt = t
  return t
}

/* ======================================================================== */
/* Pendulum: a padded cargo crate swinging from a crane gantry.              */
/* ======================================================================== */

export interface PendulumProps {
  pivot: V3 // the hinge, high above the path
  /** Floor height under the gantry posts. */
  floor: number
  length: number
  /** Swing amplitude in radians. */
  amp: number
  period: number
  /** Plane of the swing: 'x' swings across the path (left ↔ right). */
  axis?: 'x' | 'z'
  phase?: number
  /** Width of the supporting gantry (posts at ±span/2). */
  span?: number
  force?: number
  /** Extra shove toward this direction (e.g. back along the path). */
  bias?: V3
  bob?: V3
}

export function Pendulum({ pivot, floor, length, amp, period, axis = 'x', phase = 0, span = 7, force = 7, bias, bob = [1.3, 1.2, 1.3] }: PendulumProps) {
  const body = useRef<RapierRigidBody>(null)
  const arm = useRef<THREE.Group>(null!)
  const warn = [useRef<THREE.Mesh>(null!), useRef<THREE.Mesh>(null!)]
  const st = useRef({ lastSide: 0 })
  const P = useMemo(() => new THREE.Vector3(...pivot), [pivot])
  const biasV = useMemo(() => (bias ? new THREE.Vector3(...bias) : null), [bias])
  const w = (Math.PI * 2) / period
  const angleAt = (t: number) => amp * Math.sin(w * t + phase)
  const bobPos = (ang: number, out: THREE.Vector3) => (axis === 'x'
    ? out.set(P.x + Math.sin(ang) * length, P.y - Math.cos(ang) * length, P.z)
    : out.set(P.x, P.y - Math.cos(ang) * length, P.z + Math.sin(ang) * length))
  const bp = useMemo(() => new THREE.Vector3(), [])
  const lampOn = useMemo(() => M.glow('#ff5a1a', 3), [])
  const lampOff = useMemo(() => M.accent('#5a2a1a'), [])

  useBeforePhysicsStep(() => {
    const b = body.current
    if (!b) return
    const ang = angleAt(G.time)
    bobPos(ang, bp)
    b.setNextKinematicTranslation({ x: bp.x, y: bp.y, z: bp.z })
    if (axis === 'x') q.setFromAxisAngle(tmp.set(0, 0, 1), ang)
    else q.setFromAxisAngle(tmp.set(1, 0, 0), -ang)
    b.setNextKinematicRotation(q)
  })

  useFrame(() => {
    const t = G.time
    const ang = angleAt(t)
    if (axis === 'x') arm.current.rotation.set(0, 0, ang)
    else arm.current.rotation.set(-ang, 0, 0)
    bobPos(ang, bp)
    // Swing velocity (sign and size) for knock direction and warnings.
    const angVel = amp * w * Math.cos(w * t + phase)
    const vel = Math.abs(angVel) * length
    // Warning lamps: the side the crate is heading to lights up ~0.8 s ahead.
    const ahead = angleAt(t + 0.8)
    const side = ahead > amp * 0.55 ? 1 : ahead < -amp * 0.55 ? -1 : 0
    warn[0].current.material = side < 0 ? lampOn : lampOff
    warn[1].current.material = side > 0 ? lampOn : lampOff
    if (side !== 0 && side !== st.current.lastSide) sfx('tick', P, 0.35)
    st.current.lastSide = side
    const dir = axis === 'x' ? tmp.set(Math.sign(angVel), 0, 0) : tmp.set(0, 0, Math.sign(angVel))
    if (biasV) dir.multiplyScalar(0.25).add(biasV).normalize()
    if (vel < 1.2) return
    const hx = bob[0] / 2, hy = bob[1] / 2, hz = bob[2] / 2
    for (const m of ownMinis()) {
      if (Math.abs(m.pos.x - bp.x) < hx + MINI.radius && Math.abs(m.pos.z - bp.z) < hz + MINI.radius && Math.abs(m.pos.y - bp.y) < hy + 0.55) knockMini(m, dir, force)
    }
    const B = G.big
    if (isHost() && B.active && !B.dead) {
      if (Math.abs(B.pos.x - bp.x) < hx + BIG.radius && Math.abs(B.pos.z - bp.z) < hz + BIG.radius && Math.abs(B.pos.y - bp.y) < hy + 1.1) knockBig(dir, force)
    }
  })

  // Gantry crane across the path: posts at ±span/2 on X, beam carrying the hinge.
  const half = span / 2
  const postH = pivot[1] - floor
  return (
    <>
      <group position={[pivot[0], floor, pivot[2]]} userData={{ batch: true }}>
        {[-1, 1].map((s) => (
          <group key={s} position={[s * half, 0, 0]}>
            <mesh geometry={worldBox(0.55, postH, 0.55, 2)} material={envMat('dark')} position-y={postH / 2} castShadow />
            {[0.25, 0.5, 0.75].map((k) => <mesh key={k} geometry={worldBox(0.62, 0.12, 0.62, 1)} material={envMat('yellow')} position-y={postH * k} />)}
            <mesh geometry={worldBox(1.1, 0.25, 1.1, 1)} material={envMat('dark')} position-y={0.12} />
          </group>
        ))}
        <mesh geometry={worldBox(span + 0.6, 0.6, 0.65, 2)} material={envMat('yellow')} position-y={postH + 0.2} castShadow />
        <mesh geometry={worldBox(span + 0.7, 0.1, 0.75, 2)} material={envMat('hazard')} position-y={postH - 0.12} />
        <mesh geometry={GEO.cyl()} material={envMat('dark')} rotation-x={Math.PI / 2} scale={[0.24, 0.95, 0.24]} position-y={postH} />
      </group>
      {/* Warning lamps: the side the load swings to lights up first. */}
      {[-1, 1].map((s, i) => (
        <mesh key={s} ref={warn[i]} geometry={GEO.sphereLo()} material={lampOff} scale={0.2}
          position={axis === 'x' ? [pivot[0] + s * (half - 0.6), pivot[1] + 0.68, pivot[2]] : [pivot[0], pivot[1] + 0.68, pivot[2] + s * 0.5]} />
      ))}
      <group position={pivot}>
        <group ref={arm}>
          {/* Twin cables + hook block */}
          {[-0.28, 0.28].map((o) => (
            <mesh key={o} geometry={GEO.cyl()} material={envMat('dark')} scale={[0.035, length - bob[1] / 2 - 0.3, 0.035]}
              position={axis === 'x' ? [0, -(length - bob[1] / 2 - 0.3) / 2, o] : [o, -(length - bob[1] / 2 - 0.3) / 2, 0]} />
          ))}
          <mesh geometry={GEO.rbox(1, 1, 1, 0.2)} material={M.accent('#f2b51d')} scale={[0.6, 0.4, 0.6]} position-y={-length + bob[1] / 2 + 0.35} castShadow />
          <group position-y={-length}>
            <mesh geometry={GEO.box()} material={cargoMat('#c8372d')} scale={bob} castShadow />
            {/* Rubber bumpers on the leading faces */}
            {[-1, 1].map((s) => (
              <mesh key={s} geometry={GEO.cyl()} material={M.dark()} rotation-z={axis === 'x' ? Math.PI / 2 : 0} rotation-x={axis === 'x' ? 0 : Math.PI / 2}
                scale={[0.32, 0.22, 0.32]} position={axis === 'x' ? [s * (bob[0] / 2 + 0.08), 0, 0] : [0, 0, s * (bob[2] / 2 + 0.08)]} />
            ))}
          </group>
        </group>
      </group>
      <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[pivot[0], pivot[1] - length, pivot[2]]}>
        <CuboidCollider args={[bob[0] / 2, bob[1] / 2, bob[2] / 2]} />
      </RigidBody>
    </>
  )
}

const cargoMats = new Map<string, THREE.MeshStandardMaterial>()
/** Shared container material (chevron logo + stencilled ribs). */
export function cargoMat(color: string) {
  let m = cargoMats.get(color)
  if (!m) { m = new THREE.MeshStandardMaterial({ map: cargoTex(color), roughness: 0.62, metalness: 0.25 }); cargoMats.set(color, m) }
  return m
}
