import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, CylinderCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { G, addAnchor, isHost, type Anchor } from '../runtime'
import { hostSet } from '../net/replication'
import { plates } from '../Simulation'
import { envMat, worldBox, type V3 } from './blocks'
import { beltTex, signTex } from './textures'
import { GEO, M } from '../robots/materials'
import { useRigMerge } from '../perf/StaticBatch'
import { BIG, COLORS, MINI, SLOT_COLOR } from '../tuning'
import { fx } from '../runtime'

/* ------------------------------------------------------------ helpers */

export type Who = 0 | 1 | 'big'

/** Robots whose feet are inside an axis-aligned box (host-side checks). */
export function robotsIn(center: THREE.Vector3, half: THREE.Vector3): Who[] {
  const out: Who[] = []
  for (const m of G.minis) {
    if (m.hidden || m.dead) continue
    const fy = m.pos.y - MINI.feet
    if (Math.abs(m.pos.x - center.x) <= half.x && Math.abs(fy - center.y) <= half.y && Math.abs(m.pos.z - center.z) <= half.z) out.push(m.slot)
  }
  const B = G.big
  if (B.active && !B.dead) {
    const fy = B.pos.y - BIG.feet
    if (Math.abs(B.pos.x - center.x) <= half.x + 0.4 && Math.abs(fy - center.y) <= half.y && Math.abs(B.pos.z - center.z) <= half.z + 0.4) out.push('big')
  }
  return out
}

/* ------------------------------------------------------------ Ring anchor */

export interface RingProps {
  id: string
  pos: V3
  mount?: 'post' | 'hang' | 'wall' | 'none'
  mini?: boolean
  big?: boolean
  sling?: Anchor['sling']
  scale?: number
  facing?: number
  enabledVar?: string
}

/** Relief ring: the visual language for "the cable can grab this" (GDD). */
export function Ring({ id, pos, mount = 'post', mini = true, big = true, sling, scale = 1, facing = 0, enabledVar }: RingProps) {
  const anchor = useMemo(() => addAnchor({ id, kind: 'ring', pos: new THREE.Vector3(...pos), mini, big, sling }), [id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { G.anchors.set(id, anchor); return () => { G.anchors.delete(id) } }, [id, anchor])
  const ring = useRef<THREE.Group>(null!)
  const halo = [useRef<THREE.Mesh>(null!), useRef<THREE.Mesh>(null!)]
  const s = scale * (sling ? 1.3 : 1)
  useFrame((_, dt) => {
    if (enabledVar) { anchor.enabled = !!G.vars[enabledVar]; ring.current.visible = anchor.enabled }
    for (let i = 0; i < 2; i++) {
      const hot = G.time - anchor.hot[i] < 0.12
      const h = halo[i].current
      h.visible = hot && anchor.enabled
      if (h.visible) { h.rotation.z += dt * (i ? -3 : 3); h.scale.setScalar(s * (0.75 + Math.sin(G.time * 12) * 0.05)) }
    }
  })
  return (
    <group position={pos}>
      {/* Static body of the ring: baked by the static batcher. */}
      <group ref={ring} rotation-y={facing} userData={enabledVar ? { noBatch: true } : { batch: true }}>
        <mesh geometry={GEO.torus()} material={M.glow(sling ? '#ffcf3a' : '#ffbe2e', sling ? 1.2 : 0.7)} scale={0.48 * s} castShadow />
        <mesh geometry={GEO.torus()} material={M.chrome()} scale={[0.56 * s, 0.56 * s, 0.4 * s]} />
        {[0, 1, 2, 3].map((k) => (
          <mesh key={k} geometry={GEO.box()} material={envMat('dark')} position={[Math.cos((k * Math.PI) / 2) * 0.48 * s, Math.sin((k * Math.PI) / 2) * 0.48 * s, 0]} rotation-z={(k * Math.PI) / 2} scale={[0.1 * s, 0.16 * s, 0.14 * s]} />
        ))}
        {mount === 'post' && (
          <>
            <mesh geometry={GEO.cyl()} material={envMat('dark')} position-y={-(pos[1] > 0 ? Math.min(pos[1], 4) : 2) / 2 - 0.5 * s} scale={[0.09, pos[1] > 0 ? Math.min(pos[1], 4) : 2, 0.09]} castShadow />
            <mesh geometry={GEO.box()} material={envMat('yellow')} position-y={-0.55 * s} scale={[0.3, 0.14, 0.3]} />
          </>
        )}
        {mount === 'hang' && (
          <>
            <mesh geometry={GEO.cyl()} material={envMat('dark')} position-y={0.5 * s + 1.5} scale={[0.04, 3, 0.04]} />
            <mesh geometry={GEO.box()} material={envMat('yellow')} position-y={0.55 * s} scale={[0.25, 0.14, 0.25]} />
          </>
        )}
        {mount === 'wall' && <mesh geometry={GEO.box()} material={envMat('dark')} position-z={-0.4} scale={[0.3, 0.3, 0.6]} />}
      </group>
      <group rotation-y={facing}>
        {[0, 1].map((i) => (
          <mesh key={i} ref={halo[i]} geometry={GEO.ringFlat()} material={M.basic(SLOT_COLOR[i], 0.85)} visible={false} />
        ))}
      </group>
    </group>
  )
}

/* ------------------------------------------------------------ Crates (host-simulated) */

export function Crate({ id, pos, size = 0.85, label, labelColor, killY = -20 }: { id: string; pos: V3; size?: number; label?: string; labelColor?: string; killY?: number }) {
  const body = useRef<RapierRigidBody>(null)
  const host = isHost()
  const home = useMemo(() => new THREE.Vector3(...pos), [pos])
  useEffect(() => {
    if (!body.current) return
    G.bodies.set(id, { id, body: body.current, buf: [], heldBy: -1, dynamic: host })
    return () => { G.bodies.delete(id) }
  }, [id, host])
  useFrame(() => {
    if (!host || !body.current) return
    const p = body.current.translation()
    const nb = G.bodies.get(id)
    // Critical items never get lost: they come back "through the tube".
    if (p.y < killY && nb && nb.heldBy < 0) {
      body.current.setTranslation({ x: home.x, y: home.y + 2, z: home.z }, true)
      body.current.setLinvel({ x: 0, y: 0, z: 0 }, true)
      body.current.setAngvel({ x: 0, y: 0, z: 0 }, true)
      body.current.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
      fx('particles', { n: 'poof', p: { x: home.x, y: home.y + 2, z: home.z } })
      fx('sfx', { n: 'pop', p: home })
    }
  })
  const parts = useRef<THREE.Group>(null)
  useRigMerge(parts)
  const labelTex = useMemo(() => (label ? signTex(label, '', labelColor ?? '#2d3340', '#fff', '#fff') : null), [label, labelColor])
  return (
    <RigidBody ref={body} type={host ? 'dynamic' : 'kinematicPosition'} position={pos} colliders={false} mass={6} linearDamping={0.4} angularDamping={0.8} userData={{ crate: id }} ccd>
      <CuboidCollider args={[size / 2, size / 2, size / 2]} friction={0.7} restitution={0.05} />
      <group ref={parts}>
      <mesh geometry={worldBox(size, size, size, size)} material={envMat('wood')} castShadow receiveShadow />
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z], i) => (
        <mesh key={i} geometry={GEO.box()} material={envMat('dark')} position={[(x * size) / 2, 0, (z * size) / 2]} scale={[0.1, size + 0.02, 0.1]} />
      ))}
      {labelTex && (
        <>
          <mesh position-z={size / 2 + 0.01} scale={[size * 0.8, size * 0.4, 1]}><planeGeometry /><meshBasicMaterial map={labelTex} /></mesh>
          <mesh position-z={-size / 2 - 0.01} rotation-y={Math.PI} scale={[size * 0.8, size * 0.4, 1]}><planeGeometry /><meshBasicMaterial map={labelTex} /></mesh>
        </>
      )}
      </group>
    </RigidBody>
  )
}

/* ------------------------------------------------------------ Conveyor */

export function Conveyor({ pos, size, dir, speed, speedVar, rotY = 0 }: { pos: V3; size: [number, number]; dir: [number, number]; speed: number; speedVar?: string; rotY?: number }) {
  const [w, d] = size
  const tex = useMemo(() => {
    const t = beltTex().clone()
    t.needsUpdate = true
    t.repeat.set(w / 1.2, d / 1.2)
    return t
  }, [w, d])
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, metalness: 0.2 }), [tex])
  // Arrow direction in texture space: belt texture arrows point +V.
  const ang = Math.atan2(dir[0], -dir[1])
  useFrame((_, dt) => {
    const mul = speedVar ? (G.vars[speedVar] ?? 1) : 1
    tex.offset.y -= ((speed * mul) / 1.2) * dt
    tex.rotation = 0
  })
  return (
    <group position={pos} rotation-y={rotY} userData={{ batch: true }}>
      <RigidBody type="fixed" colliders={false} userData={{ conveyor: [dir[0] * speed, 0, dir[1] * speed], speedVar }}>
        <CuboidCollider args={[w / 2, 0.15, d / 2]} position={[0, -0.15, 0]} friction={0.8} />
      </RigidBody>
      <mesh position-y={0.01} rotation={[-Math.PI / 2, 0, ang]} material={mat} receiveShadow>
        <planeGeometry args={Math.abs(Math.sin(ang)) > 0.5 ? [d, w] : [w, d]} />
      </mesh>
      <mesh geometry={worldBox(w + 0.3, 0.5, d + 0.3, 2)} material={envMat('metal')} position-y={-0.27} receiveShadow />
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={worldBox(0.14, 0.18, d, 2)} material={envMat('yellow')} position={[(s * (w + 0.16)) / 2, 0.08, 0]} castShadow />
      ))}
    </group>
  )
}

/* ------------------------------------------------------------ Gate */

/** Door that sinks into the floor when its var is truthy (both peers animate from the var). */
export function Gate({ pos, size, openVar, rotY = 0, invert = false, color = '#f2b51d' }: { pos: V3; size: V3; openVar: string; rotY?: number; invert?: boolean; color?: string }) {
  const body = useRef<RapierRigidBody>(null)
  const [w, h, d] = size
  const st = useRef({ y: 0, was: false })
  const light = useRef<THREE.Mesh>(null!)
  useFrame((_, dt) => {
    let open = !!G.vars[openVar]
    if (invert) open = !open
    const target = open ? -h - 0.05 : 0
    const s = st.current
    s.y += Math.sign(target - s.y) * Math.min(Math.abs(target - s.y), dt * 4.5)
    if (open !== s.was) { s.was = open; fx('sfx', { n: 'door', p: new THREE.Vector3(...pos) }, false) }
    body.current?.setNextKinematicTranslation({ x: pos[0], y: pos[1] + s.y, z: pos[2] })
    ;(light.current.material as THREE.MeshBasicMaterial).color.set(open ? '#5dff8a' : '#ff5a3a')
  })
  return (
    <>
      <RigidBody ref={body} type="kinematicPosition" position={pos} rotation-y={rotY} colliders={false}>
        <CuboidCollider args={[w / 2, h / 2, d / 2]} position={[0, h / 2, 0]} />
        <mesh geometry={worldBox(w, h, d, 2)} material={envMat('metal')} position-y={h / 2} castShadow receiveShadow />
        <mesh geometry={worldBox(w * 0.9, 0.3, d + 0.04, 1)} material={envMat('hazard')} position-y={h - 0.25} />
        <mesh geometry={GEO.box()} material={M.accent(color)} position-y={h * 0.5} scale={[w * 0.5, 0.18, d + 0.06]} />
      </RigidBody>
      <group position={pos} rotation-y={rotY} userData={{ batch: true }}>
        {[-1, 1].map((s) => <mesh key={s} geometry={worldBox(0.35, h + 0.6, d + 0.3, 2)} material={envMat('dark')} position={[(s * (w + 0.35)) / 2, (h + 0.6) / 2 - 0.3, 0]} castShadow />)}
        <mesh geometry={worldBox(w + 0.7, 0.35, d + 0.3, 2)} material={envMat('dark')} position-y={h + 0.3} castShadow />
        <mesh ref={light} geometry={GEO.sphereLo()} material={M.basic('#ff5a3a').clone()} position={[0, h + 0.55, 0]} scale={0.16} />
      </group>
    </>
  )
}

/* ------------------------------------------------------------ Pressure switch */

/** Floor button. Host sets `sw:<id>` while pressed; `latch` keeps it on. */
export function Switch({ id, pos, radius = 0.8, color = '#f2b51d', latch = false, label, onChange, crates = false, robots = true }: { id: string; pos: V3; radius?: number; color?: string; latch?: boolean; label?: string; onChange?: (on: boolean, who: Who[]) => void; crates?: boolean; robots?: boolean }) {
  const cap = useRef<THREE.Mesh>(null!)
  const c = useMemo(() => new THREE.Vector3(...pos), [pos])
  const half = useMemo(() => new THREE.Vector3(radius, 0.6, radius), [radius])
  const st = useRef({ on: false, y: 0 })
  useFrame((_, dt) => {
    const key = `sw:${id}`
    if (isHost()) {
      const who = robots ? robotsIn(c, half) : []
      let crate = false
      if (crates) {
        for (const nb of G.bodies.values()) {
          if (nb.heldBy >= 0) continue
          const p = nb.body.translation()
          if (Math.hypot(p.x - c.x, p.z - c.z) < radius + 0.2 && Math.abs(p.y - c.y) < 1.2) crate = true
        }
      }
      const on = latch ? st.current.on || who.length > 0 || crate : who.length > 0 || crate
      if (on !== st.current.on) {
        st.current.on = on
        hostSet(key, on ? 1 : 0)
        fx('sfx', { n: 'lever', p: c })
        onChange?.(on, who)
      }
    }
    const pressed = !!G.vars[key]
    st.current.y = THREE.MathUtils.damp(st.current.y, pressed ? -0.1 : 0, 18, dt)
    cap.current.position.y = 0.12 + st.current.y
    ;(cap.current.material as THREE.MeshStandardMaterial).emissiveIntensity = pressed ? 1.4 : 0.15
  })
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.15, roughness: 0.4 }), [color])
  return (
    <group position={pos}>
      <mesh geometry={GEO.cyl()} material={envMat('dark')} scale={[radius + 0.15, 0.12, radius + 0.15]} position-y={0.03} receiveShadow userData={{ batch: true }} />
      <mesh ref={cap} geometry={GEO.cyl()} material={mat} scale={[radius, 0.14, radius]} castShadow />
      {label && <Sign pos={[0, 1.6, -radius - 0.2]} text={label} small />}
    </group>
  )
}

/* ------------------------------------------------------------ Safety net */

export function SafetyNet({ pos, size, returnTo }: { pos: V3; size: [number, number]; returnTo: V3 }) {
  const [w, d] = size
  const grid = useMemo(() => {
    const pts: number[] = []
    const step = 0.5
    for (let x = -w / 2; x <= w / 2 + 1e-3; x += step) pts.push(x, 0, -d / 2, x, 0, d / 2)
    for (let z = -d / 2; z <= d / 2 + 1e-3; z += step) pts.push(-w / 2, 0, z, w / 2, 0, z)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    return g
  }, [w, d])
  const lines = useRef<THREE.LineSegments>(null!)
  useFrame(() => { lines.current.position.y = Math.sin(G.time * 2) * 0.03 })
  return (
    <group position={pos} userData={{ batch: true }}>
      <RigidBody type="fixed" colliders={false} userData={{ net: returnTo }}>
        <CuboidCollider args={[w / 2, 0.1, d / 2]} position={[0, -0.1, 0]} />
      </RigidBody>
      <lineSegments ref={lines} geometry={grid}><lineBasicMaterial color="#f4e9d0" transparent opacity={0.85} /></lineSegments>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.02}><planeGeometry args={[w, d]} /><meshBasicMaterial color="#ffffff" transparent opacity={0.08} side={THREE.DoubleSide} depthWrite={false} /></mesh>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z], i) => (
        <mesh key={i} geometry={GEO.cyl()} material={envMat('dark')} position={[(x * w) / 2, -0.4, (z * d) / 2]} scale={[0.07, 1, 0.07]} />
      ))}
      {[-1, 1].map((s) => <mesh key={s} geometry={worldBox(w, 0.08, 0.08)} material={envMat('yellow')} position={[0, 0, (s * d) / 2]} />)}
      {[-1, 1].map((s) => <mesh key={'x' + s} geometry={worldBox(0.08, 0.08, d)} material={envMat('yellow')} position={[(s * w) / 2, 0, 0]} />)}
    </group>
  )
}

/* ------------------------------------------------------------ Spring pad */

export function SpringPad({ pos, bounce = 15, rotY = 0 }: { pos: V3; bounce?: number; rotY?: number }) {
  const top = useRef<THREE.Group>(null!)
  const center = useMemo(() => new THREE.Vector3(...pos), [pos])
  const half = useMemo(() => new THREE.Vector3(0.9, 0.5, 0.9), [])
  const st = useRef({ t: -9 })
  useFrame(() => {
    if (robotsIn(center, half).length) st.current.t = G.time
    const k = Math.max(0, 1 - (G.time - st.current.t) * 4)
    top.current.position.y = 0.25 + Math.sin(k * Math.PI * 3) * 0.15 * k
  })
  return (
    <group position={pos} rotation-y={rotY}>
      <RigidBody type="fixed" colliders={false} userData={{ bounce }}>
        <CylinderCollider args={[0.15, 0.9]} position={[0, 0.15, 0]} />
      </RigidBody>
      <mesh geometry={GEO.cyl()} material={envMat('dark')} scale={[0.95, 0.2, 0.95]} position-y={0.05} userData={{ batch: true }} />
      <mesh geometry={GEO.torus()} material={envMat('yellow')} rotation-x={Math.PI / 2} scale={[0.6, 0.6, 1.6]} position-y={0.17} userData={{ batch: true }} />
      <group ref={top}>
        <mesh geometry={GEO.cyl()} material={envMat('pad')} scale={[0.9, 0.08, 0.9]} castShadow />
        <mesh geometry={GEO.ringFlat()} material={M.glow('#ffd23a', 1.5)} rotation-x={-Math.PI / 2} position-y={0.05} scale={0.6} />
      </group>
    </group>
  )
}

/* ------------------------------------------------------------ Couple plate */

export function CouplePlate({ id, pos, yaw = 0, radius = 2.4, enabledVar }: { id: string; pos: V3; yaw?: number; radius?: number; enabledVar?: string }) {
  useEffect(() => {
    plates.set(id, { id, pos: new THREE.Vector3(...pos), radius, yaw, enabled: () => (enabledVar ? !!G.vars[enabledVar] : true) && G.form === 'split' })
    return () => { plates.delete(id) }
  }, [id, pos, radius, yaw, enabledVar])
  const rings = [useRef<THREE.Mesh>(null!), useRef<THREE.Mesh>(null!)]
  const core = useRef<THREE.Mesh>(null!)
  const foot = [useRef<THREE.Group>(null!), useRef<THREE.Group>(null!)]
  useFrame(() => {
    const en = (enabledVar ? !!G.vars[enabledVar] : true) && G.form === 'split'
    for (let i = 0; i < 2; i++) {
      const m = G.minis[i]
      const on = Math.hypot(m.pos.x - pos[0], m.pos.z - pos[2]) < radius && !m.hidden
      const k = Math.min(1, m.coupleHold / BIG.coupleHold)
      const r = rings[i].current
      r.visible = en
      r.scale.setScalar(radius * (0.55 + i * 0.12))
      ;(r.material as THREE.MeshBasicMaterial).opacity = on ? 0.35 + k * 0.65 : 0.25
      foot[i].current.scale.setScalar(1 + k * 0.2)
      foot[i].current.position.y = 0.06 + k * 0.05
    }
    core.current.rotation.y += 0.01
    ;(core.current.material as THREE.MeshStandardMaterial).emissiveIntensity = en ? 1 + Math.sin(G.time * 3) * 0.5 : 0.1
  })
  const coreMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#bdf6ff', emissiveIntensity: 1, roughness: 0.3 }), [])
  return (
    <group position={pos} rotation-y={yaw}>
      <mesh geometry={GEO.cyl()} material={envMat('plate')} scale={[radius, 0.12, radius]} position-y={0.0} receiveShadow userData={{ batch: true }} />
      <mesh geometry={GEO.torus()} material={envMat('yellow')} rotation-x={Math.PI / 2} scale={[radius, radius, 0.8]} position-y={0.06} userData={{ batch: true }} />
      <mesh ref={core} geometry={GEO.cyl()} material={coreMat} scale={[0.35, 0.1, 0.35]} position-y={0.08} />
      {[0, 1].map((i) => (
        <mesh key={i} ref={rings[i]} geometry={GEO.ringFlat()} rotation-x={-Math.PI / 2} position-y={0.075} material={new THREE.MeshBasicMaterial({ color: SLOT_COLOR[i], transparent: true, opacity: 0.3, toneMapped: false })} />
      ))}
      {[0, 1].map((i) => (
        <group key={'f' + i} ref={foot[i]} position={[i === 0 ? radius * 0.45 : -radius * 0.45, 0.06, 0]}>
          <mesh geometry={GEO.rbox(1, 1, 1, 0.3)} material={M.accent(i === 0 ? COLORS.cyan : COLORS.amber)} scale={[0.4, 0.06, 0.65]} />
          {/* Shape identity: circle for Cian, triangle for Ámbar */}
          {i === 0 ? <mesh geometry={GEO.torus()} material={M.basic('#ffffff')} rotation-x={Math.PI / 2} position-y={0.04} scale={0.12} /> : <mesh geometry={GEO.cone()} material={M.basic('#ffffff')} position-y={0.06} scale={[0.15, 0.04, 0.15]} rotation-y={Math.PI / 3} />}
        </group>
      ))}
    </group>
  )
}

/* ------------------------------------------------------------ Signs */

export function Sign({ pos, rotY = 0, text, sub = '', small = false, post = true, bg }: { pos: V3; rotY?: number; text: string; sub?: string; small?: boolean; post?: boolean; bg?: string }) {
  const tex = useMemo(() => signTex(text, sub, bg), [text, sub, bg])
  const s = small ? 0.6 : 1
  return (
    <group position={pos} rotation-y={rotY} userData={{ batch: true }}>
      <mesh scale={[2.6 * s, 1.3 * s, 1]} castShadow><planeGeometry /><meshStandardMaterial map={tex} roughness={0.6} /></mesh>
      <mesh position-z={-0.03} scale={[2.75 * s, 1.45 * s, 0.05]} material={envMat('dark')} geometry={GEO.box()} />
      {post && <mesh geometry={GEO.cyl()} material={envMat('dark')} position-y={-1.2 * s} scale={[0.06, 1.8 * s, 0.06]} />}
    </group>
  )
}

/* ------------------------------------------------------------ Trigger zones (host) */

export function Zone({ pos, half, onEnter, onInside, once = true }: { pos: V3; half: V3; onEnter?: (who: Who[]) => void; onInside?: (who: Who[], dt: number) => void; once?: boolean }) {
  const st = useRef({ fired: false, last: 0 })
  const c = useMemo(() => new THREE.Vector3(...pos), [pos])
  const h = useMemo(() => new THREE.Vector3(...half), [half])
  useFrame((_, dt) => {
    if (!isHost() || G.paused) return
    const who = robotsIn(c, h)
    onInside?.(who, dt)
    if (who.length && (!once || !st.current.fired) && who.length !== st.current.last) {
      st.current.fired = true
      onEnter?.(who)
    }
    st.current.last = who.length
  })
  return null
}

/** Glowing beacon showing the active checkpoint. */
export function Beacon({ pos, id }: { pos: V3; id: string }) {
  const lamp = useRef<THREE.Mesh>(null!)
  useFrame(() => {
    const on = G.checkpoint?.id === id
    const m = lamp.current.material as THREE.MeshStandardMaterial
    m.emissiveIntensity = on ? 2 + Math.sin(G.time * 4) : 0.2
  })
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#7dffb0', emissive: '#41ff8a', emissiveIntensity: 0.2, toneMapped: false }), [])
  return (
    <group position={pos} userData={{ batch: true }}>
      <mesh geometry={GEO.cyl()} material={envMat('dark')} position-y={0.6} scale={[0.07, 1.2, 0.07]} castShadow />
      <mesh ref={lamp} geometry={GEO.sphereLo()} material={mat} position-y={1.3} scale={0.16} />
      <mesh geometry={GEO.cyl()} material={envMat('yellow')} position-y={0.05} scale={[0.25, 0.1, 0.25]} />
    </group>
  )
}
