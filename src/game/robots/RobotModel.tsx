import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { mergeRig } from '../perf/StaticBatch'
import { tier } from '../../core/device'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { GEO, M } from './materials'
import { VisorFace, type Expression } from './eyes'
import { COLORS } from '../tuning'
import { damp } from '../runtime'

export interface RobotView {
  vel: THREE.Vector3
  yaw: number
  grounded: boolean
  crouch: boolean
  /** World-space hand targets (cable, handle, offered glove…). null = free animation. */
  handTargets: [THREE.Vector3 | null, THREE.Vector3 | null]
  /** Whether the forearm/fist is away on a cable (hide the fist). */
  fistAway: [boolean, boolean]
  hanging: boolean
  carrying: boolean
  offering: boolean
  landT: number
  landImpact: number
  jumpT: number
  emote: number
  emoteT: number
  stun: number
  talk: number
  now: number
  expression?: Expression
  lookAt?: THREE.Vector3 | null
  torsion?: number
  legPush?: [number, number]
  /** Written by the model: world-space hand positions (for cables & HUD). */
  handWorld: [THREE.Vector3, THREE.Vector3]
  headWorld: THREE.Vector3
  rootWorld: THREE.Vector3
}

export function makeView(): RobotView {
  return {
    vel: new THREE.Vector3(), yaw: 0, grounded: true, crouch: false, handTargets: [null, null], fistAway: [false, false],
    hanging: false, carrying: false, offering: false, landT: -9, landImpact: 0, jumpT: -9, emote: 0, emoteT: -9, stun: 0, talk: 0, now: 0,
    handWorld: [new THREE.Vector3(), new THREE.Vector3()], headWorld: new THREE.Vector3(), rootWorld: new THREE.Vector3(),
  }
}

interface Props {
  variant: 'mini' | 'big'
  /** 0 = Cian, 1 = Ámbar. The joined body mixes both. */
  slot: 0 | 1
  view: RobotView
  visible?: () => boolean
}

const UP = new THREE.Vector3(0, -1, 0)
const tmp = new THREE.Vector3()
const tmp2 = new THREE.Vector3()
const q = new THREE.Quaternion()
const qInv = new THREE.Quaternion()

/** Damped spring used for antennae secondary motion. */
class Spring {
  x = 0; v = 0
  step(target: number, k: number, d: number, dt: number) {
    const a = (target - this.x) * k - this.v * d
    this.v += a * dt
    this.x += this.v * dt
    return this.x
  }
}

export function RobotModel({ variant, slot, view, visible }: Props) {
  const big = variant === 'big'
  const accentHex = [COLORS.cyan, COLORS.amber]
  const deepHex = [COLORS.cyanDeep, COLORS.amberDeep]
  // Per-side accents: mini uses its own colour on both sides; the joined body splits it.
  const sideAccent = (side: 0 | 1) => (big ? accentHex[side] : accentHex[slot])
  const sideSecondary = (side: 0 | 1) => (big ? accentHex[side === 0 ? 1 : 0] : accentHex[slot === 0 ? 1 : 0])
  const bootHex = (side: 0 | 1) => (big ? deepHex[side] : deepHex[slot === 0 ? 1 : 0])
  const eyeCols: [string, string] = big ? ['#8ff6ff', '#ffd27a'] : slot === 0 ? ['#8ff6ff', '#8ff6ff'] : ['#ffe08a', '#ffe08a']

  const face = useMemo(() => new VisorFace(eyeCols), []) // eslint-disable-line react-hooks/exhaustive-deps
  const visorMat = useMemo(() => new THREE.MeshStandardMaterial({ map: face.tex, emissive: '#ffffff', emissiveMap: face.tex, emissiveIntensity: 1.6, roughness: 0.12, metalness: 0.3, toneMapped: false }), [face])
  useEffect(() => () => { visorMat.dispose(); face.tex.dispose() }, [visorMat, face])

  const root = useRef<THREE.Group>(null!)
  const hips = useRef<THREE.Group>(null!)
  const torso = useRef<THREE.Group>(null!)
  const head = useRef<THREE.Group>(null!)
  const ant = [useRef<THREE.Group>(null!), useRef<THREE.Group>(null!)]
  const shoulder = [useRef<THREE.Group>(null!), useRef<THREE.Group>(null!)]
  const elbow = [useRef<THREE.Group>(null!), useRef<THREE.Group>(null!)]
  const hand = [useRef<THREE.Group>(null!), useRef<THREE.Group>(null!)]
  const leg = [useRef<THREE.Group>(null!), useRef<THREE.Group>(null!)]
  const knee = [useRef<THREE.Group>(null!), useRef<THREE.Group>(null!)]
  const boot = [useRef<THREE.Group>(null!), useRef<THREE.Group>(null!)]
  const chestLight = useRef<THREE.Mesh>(null!)
  const blob = useRef<THREE.Mesh>(null!)

  const st = useRef({
    phase: 0, speed: 0, yaw: view.yaw, lean: 0, side: 0, blinkAt: 1 + Math.random() * 3, blinkUntil: 0,
    antX: [new Spring(), new Spring()], antZ: [new Spring(), new Spring()], prevVel: new THREE.Vector3(), accel: new THREE.Vector3(),
    stepSide: 0, crouch: 0, offer: 0, hang: 0, carry: 0, armBlend: [0, 0], lookX: 0, lookY: 0, torsion: 0,
  })

  // Bake sibling parts per joint into single meshes (fewer draw calls).
  useLayoutEffect(() => { if (root.current) mergeRig(root.current, M.rigVC()) }, [])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20)
    const r = root.current
    if (!r) return
    const show = visible ? visible() : true
    r.visible = show
    if (!show) return
    const s = st.current
    const v = view
    const now = v.now

    // Smoothed locomotion values.
    const hs = Math.hypot(v.vel.x, v.vel.z)
    const maxSpeed = big ? 3.6 : 5
    s.speed = damp(s.speed, v.grounded ? hs : 0, 12, dt)
    s.accel.copy(v.vel).sub(s.prevVel).divideScalar(Math.max(dt, 1e-3))
    s.prevVel.copy(v.vel)
    s.yaw = v.yaw
    s.crouch = damp(s.crouch, v.crouch ? 1 : 0, 14, dt)
    s.offer = damp(s.offer, v.offering ? 1 : 0, 12, dt)
    s.hang = damp(s.hang, v.hanging ? 1 : 0, 12, dt)
    s.carry = damp(s.carry, v.carrying ? 1 : 0, 12, dt)
    s.torsion = damp(s.torsion, v.torsion ?? 0, 8, dt)
    const k = Math.min(1, s.speed / maxSpeed)
    s.phase += dt * (big ? 5.2 : 9.5) * Math.max(0.25, k) * (s.speed > 0.15 ? 1 : 0)

    r.rotation.y = s.yaw
    blob.current.visible = tier() === 'low' && v.grounded
    r.getWorldPosition(v.rootWorld)

    // Squash & stretch from landing / jumping.
    const tl = now - v.landT
    const squash = v.landImpact * Math.exp(-tl * 11) * Math.cos(tl * 18) * (big ? 0.18 : 0.28)
    const tj = now - v.jumpT
    const stretch = tj < 0.35 ? Math.sin((tj / 0.35) * Math.PI) * 0.14 : 0
    const sy = 1 - squash + stretch - s.crouch * 0.12
    const sxz = 1 + squash * 0.6 - stretch * 0.5 + s.crouch * 0.06
    const S = big ? 2.2 : 1
    r.scale.set(S * sxz, S * sy, S * sxz)

    // Lean into acceleration (local space).
    const fwdAcc = s.accel.x * Math.sin(s.yaw) + s.accel.z * Math.cos(s.yaw)
    const sideAcc = s.accel.x * Math.cos(s.yaw) - s.accel.z * Math.sin(s.yaw)
    s.lean = damp(s.lean, THREE.MathUtils.clamp(k * 0.16 + fwdAcc * 0.004, -0.25, 0.3), 8, dt)
    s.side = damp(s.side, THREE.MathUtils.clamp(-sideAcc * 0.006, -0.2, 0.2), 8, dt)

    const bob = v.grounded ? Math.abs(Math.sin(s.phase)) * 0.035 * k : 0
    const breathe = Math.sin(now * 2.2) * 0.008
    hips.current.position.y = 0.36 - s.crouch * 0.12 + bob + breathe
    hips.current.rotation.set(s.lean * 0.6, s.torsion * 0.35, s.side)
    torso.current.rotation.set(s.lean * 0.5 + s.carry * -0.08, s.torsion * 0.4 + Math.sin(s.phase) * 0.08 * k, 0)

    const et = now - v.emoteT
    // Legs.
    for (let i = 0 as 0 | 1; i < 2; i = (i + 1) as 0 | 1) {
      const sgn = i === 0 ? 1 : -1
      const ph = s.phase + (i === 0 ? 0 : Math.PI)
      let swing = Math.sin(ph) * 0.75 * k
      let bend = Math.max(0, -Math.cos(ph)) * 0.9 * k + s.crouch * 0.9
      if (!v.grounded) {
        const rising = v.vel.y > 0
        swing = rising ? (i === 0 ? -0.6 : 0.35) : (i === 0 ? -0.15 : 0.15)
        bend = rising ? (i === 0 ? 1.2 : 0.4) : 0.25
        if (s.hang > 0.5) { swing = Math.sin(now * 3 + i) * 0.3; bend = 0.3 }
      }
      const push = v.legPush ? v.legPush[i] : 0
      leg[i].current.rotation.set(-swing - s.crouch * 0.6 - push * 0.3, 0, sgn * 0.04)
      knee[i].current.rotation.set(bend, 0, 0)
      boot[i].current.rotation.set(-bend * 0.5 + swing * 0.3 + s.crouch * 0.3, 0, 0)
    }

    // Arms: either free animation or IK-ish aim at a world target.
    torso.current.updateWorldMatrix(true, false)
    for (let i = 0 as 0 | 1; i < 2; i = (i + 1) as 0 | 1) {
      const sh = shoulder[i].current
      const el = elbow[i].current
      const target = v.handTargets[i]
      const sgn = i === 0 ? 1 : -1
      s.armBlend[i] = damp(s.armBlend[i], target ? 1 : 0, 16, dt)
      // Free pose.
      const ph = s.phase + (i === 0 ? Math.PI : 0)
      let ax = Math.sin(ph) * 0.8 * k
      let az = sgn * (0.12 + k * 0.05)
      let bendA = 0.35 + k * 0.4
      if (!v.grounded && s.hang < 0.5) { ax = -1.9 - Math.sin(now * 10 + i) * 0.1; az = sgn * 0.5; bendA = 0.4 }
      if (s.carry > 0.01) { ax = THREE.MathUtils.lerp(ax, -2.75, s.carry); az = THREE.MathUtils.lerp(az, sgn * 0.25, s.carry); bendA = THREE.MathUtils.lerp(bendA, 0.55, s.carry) }
      // Emotes.
      if (et < 1.6 && v.emote) {
        const e = v.emote
        if (e === 1 && i === 1) { ax = -2.6; az = -0.4 + Math.sin(et * 14) * 0.35; bendA = 0.3 } // wave
        if (e === 2) { ax = -2.8; az = sgn * (0.4 + Math.sin(et * 16) * 0.15); bendA = 0.1 } // cheer
        if (e === 3 && i === 0) { ax = -1.4; az = 0.2; bendA = 0.2 } // point "aquí"
        if (e === 4) { ax = -0.6; az = sgn * 1.1; bendA = 1.2 } // shrug "¿?"
      }
      sh.rotation.set(ax, 0, az)
      el.rotation.set(-bendA, 0, 0)
      if (target && s.armBlend[i] > 0.01) {
        // Aim the shoulder at the target in torso-local space.
        sh.parent!.updateWorldMatrix(true, false)
        tmp.copy(target)
        sh.parent!.worldToLocal(tmp)
        tmp.sub(sh.position).normalize()
        q.setFromUnitVectors(UP, tmp)
        qInv.setFromEuler(sh.rotation)
        qInv.slerp(q, s.armBlend[i])
        sh.quaternion.copy(qInv)
        el.rotation.x = -bendA * (1 - s.armBlend[i])
      }
      hand[i].current.visible = !v.fistAway[i]
      hand[i].current.getWorldPosition(v.handWorld[i])
    }

    // Head: look target + blink + expression.
    let lookX = 0
    let lookY = 0
    if (v.lookAt) {
      head.current.getWorldPosition(tmp2)
      tmp.copy(v.lookAt).sub(tmp2)
      const localYaw = Math.atan2(tmp.x, tmp.z) - s.yaw
      const ly = Math.atan2(Math.sin(localYaw), Math.cos(localYaw))
      lookX = THREE.MathUtils.clamp(ly, -0.9, 0.9)
      lookY = THREE.MathUtils.clamp(Math.atan2(tmp.y, Math.hypot(tmp.x, tmp.z)), -0.5, 0.5)
    }
    s.lookX = damp(s.lookX, lookX, 6, dt)
    s.lookY = damp(s.lookY, lookY, 6, dt)
    head.current.rotation.set(-s.lookY * 0.5 + Math.sin(now * 1.7) * 0.02 - s.lean * 0.3, s.lookX * 0.55, Math.sin(now * 1.1) * 0.03 - s.side * 0.5)
    head.current.getWorldPosition(v.headWorld)

    if (now > s.blinkAt) { s.blinkUntil = now + 0.12; s.blinkAt = now + 1.8 + Math.random() * 3.5 }
    let expr: Expression = v.expression ?? 'normal'
    if (v.stun > 0) expr = 'dizzy'
    else if (et < 1.6 && v.emote === 2) expr = 'happy'
    else if (et < 1.6 && v.emote === 1) expr = 'happy'
    else if (et < 1.6 && v.emote === 4) expr = 'surprised'
    else if (!v.grounded && v.vel.y < -12) expr = 'surprised'
    else if (s.hang > 0.5 || s.offer > 0.5) expr = 'determined'
    if (expr === 'normal' && now < s.blinkUntil) expr = 'blink'
    face.draw(expr, s.lookX * 0.8, s.lookY, v.talk)

    // Antennae: springs driven by acceleration and landing.
    for (let i = 0; i < 2; i++) {
      const ax = s.antX[i].step(-fwdAcc * 0.012 + (v.grounded ? 0 : -v.vel.y * 0.02) + squash * 2, 120, 7, dt)
      const az = s.antZ[i].step(sideAcc * 0.012 + (i === 0 ? 0.08 : -0.08), 120, 7, dt)
      ant[i].current.rotation.set(THREE.MathUtils.clamp(ax, -0.9, 0.9), 0, THREE.MathUtils.clamp(az, -0.9, 0.9))
    }
    const cl = chestLight.current.material as THREE.MeshStandardMaterial
    cl.emissiveIntensity = 1.6 + Math.sin(now * 3) * 0.6 + v.talk * 3
  })

  const S = big ? 2.2 : 1
  const accentMats = [M.accent(sideAccent(0)), M.accent(sideAccent(1))]
  const glowSecondary = [M.glow(sideSecondary(0), 2.4), M.glow(sideSecondary(1), 2.4)]
  const bootMat = [M.accent(bootHex(0)), M.accent(bootHex(1))]
  const emblemMat = M.accent(big ? COLORS.ivoryShade : sideSecondary(0))
  const chestMat = useMemo(() => M.glow(sideSecondary(0), 2).clone(), []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <group ref={root} scale={S}>
      {/* contact shadow blob */}
      <mesh ref={blob} rotation-x={-Math.PI / 2} position-y={0.02} material={M.blob()} renderOrder={1} userData={{ noMerge: true }}><planeGeometry args={[0.9, 0.9]} /></mesh>
      <group ref={hips} position-y={0.36}>
        {/* Legs */}
        {[0, 1].map((i) => (
          <group key={i} ref={leg[i]} position={[i === 0 ? 0.11 : -0.11, 0, 0]}>
            <mesh geometry={GEO.sphere()} material={M.joint()} scale={0.055} castShadow />
            <mesh geometry={GEO.capsule()} material={M.joint()} position-y={-0.065} scale={[0.07, 0.09, 0.07]} castShadow />
            <group ref={knee[i]} position-y={-0.13}>
              <mesh geometry={GEO.sphere()} material={M.joint()} scale={0.05} castShadow />
              <mesh geometry={GEO.capsule()} material={M.ivory()} position-y={-0.06} scale={[0.1, 0.07, 0.1]} castShadow />
              <group ref={boot[i]} position-y={-0.13}>
                {/* Chunky boot with sole and cuff, as in the concept art */}
                <mesh geometry={GEO.rbox(1, 1, 1, 0.3)} material={bootMat[i as 0 | 1]} position={[0, -0.02, 0.035]} scale={[0.17, 0.12, 0.26]} castShadow />
                <mesh geometry={GEO.rbox(1, 1, 1, 0.25)} material={M.ivory()} position={[0, 0.005, 0.1]} scale={[0.15, 0.08, 0.1]} castShadow />
                <mesh geometry={GEO.rbox(1, 1, 1, 0.3)} material={M.sole()} position={[0, -0.075, 0.035]} scale={[0.18, 0.045, 0.28]} castShadow />
                <mesh geometry={GEO.cyl()} material={M.ivoryShade()} position={[0, 0.05, -0.01]} scale={[0.075, 0.05, 0.075]} castShadow />
              </group>
            </group>
          </group>
        ))}
        <group ref={torso}>
          {/* Torso: ivory shell with an accent belly plate */}
          <mesh geometry={GEO.sphere()} material={M.ivory()} position-y={0.2} scale={[0.27, 0.25, 0.245]} castShadow />
          <mesh geometry={GEO.sphere()} material={accentMats[0]} position={[0.02, 0.1, 0]} scale={[0.255, 0.15, 0.24]} castShadow />
          {big && <mesh geometry={GEO.sphere()} material={accentMats[1]} position={[-0.02, 0.1, 0]} scale={[0.255, 0.15, 0.24]} castShadow />}
          <mesh geometry={GEO.torus()} material={M.joint()} position-y={0.14} rotation-x={Math.PI / 2} scale={[0.262, 0.262, 0.25]} />
          {/* Planet emblem (Cian) / star badge (Ámbar): shape identity beyond colour */}
          <group position={[0, 0.22, 0.235]}>
            <mesh geometry={GEO.sphere()} material={emblemMat} scale={0.042} />
            {slot === 0 || big ? (
              <mesh geometry={GEO.torus()} material={M.dark()} rotation={[1.2, 0, 0.4]} scale={0.07} />
            ) : (
              <mesh geometry={GEO.cone()} material={M.dark()} rotation-x={Math.PI / 2} position-z={0.01} scale={[0.05, 0.03, 0.05]} />
            )}
          </group>
          <mesh ref={chestLight} geometry={GEO.sphereLo()} material={chestMat} position={[0.12, 0.3, 0.19]} scale={0.018} />
          {/* Back pack with exhaust */}
          <mesh geometry={GEO.rbox(1, 1, 1, 0.3)} material={M.ivoryShade()} position={[0, 0.22, -0.22]} scale={[0.22, 0.2, 0.1]} castShadow />
          <mesh geometry={GEO.cyl()} material={M.joint()} position={[0.06, 0.32, -0.26]} scale={[0.025, 0.08, 0.025]} />
          <mesh geometry={GEO.cyl()} material={M.joint()} position={[-0.06, 0.32, -0.26]} scale={[0.025, 0.08, 0.025]} />
          {/* Neck + head */}
          <mesh geometry={GEO.cyl()} material={M.joint()} position-y={0.43} scale={[0.06, 0.07, 0.06]} />
          <group ref={head} position-y={0.58}>
            <mesh geometry={GEO.rbox(1, 1, 1, 0.28)} material={M.ivory()} scale={[0.37, 0.28, 0.31]} castShadow />
            <mesh geometry={GEO.rbox(1, 1, 1, 0.3)} material={M.visor()} position-z={0.13} scale={[0.31, 0.2, 0.08]} />
            <mesh material={visorMat} position-z={0.172} geometry={GEO.box()} scale={[0.27, 0.165, 0.002]} />
            {/* Ear pods */}
            {[0, 1].map((i) => (
              <group key={i} position={[i === 0 ? 0.19 : -0.19, 0, 0]} rotation-z={Math.PI / 2}>
                <mesh geometry={GEO.cyl()} material={accentMats[i]} scale={[0.07, 0.05, 0.07]} castShadow />
                <mesh geometry={GEO.torus()} material={glowSecondary[i]} position-y={i === 0 ? 0.027 : -0.027} rotation-x={Math.PI / 2} scale={0.04} />
              </group>
            ))}
            {/* Antennae with springy tips */}
            {[0, 1].map((i) => (
              <group key={i} ref={ant[i]} position={[i === 0 ? 0.1 : -0.1, 0.13, -0.02]}>
                <mesh geometry={GEO.cyl()} material={M.joint()} position-y={0.08} scale={[0.012, 0.16, 0.012]} />
                {slot === 1 && !big ? (
                  <mesh geometry={GEO.cone()} material={glowSecondary[i]} position-y={0.18} scale={[0.035, 0.07, 0.035]} />
                ) : (
                  <mesh geometry={GEO.sphere()} material={glowSecondary[i]} position-y={0.175} scale={0.034} />
                )}
              </group>
            ))}
          </group>
          {/* Arms */}
          {[0, 1].map((i) => (
            <group key={i} ref={shoulder[i]} position={[i === 0 ? 0.28 : -0.28, 0.28, 0]}>
              <mesh geometry={GEO.sphere()} material={accentMats[i]} scale={0.075} castShadow />
              <mesh geometry={GEO.capsule()} material={M.ivory()} position-y={-0.07} scale={[0.085, 0.07, 0.085]} castShadow />
              <group ref={elbow[i]} position-y={-0.14}>
                <mesh geometry={GEO.sphere()} material={M.joint()} scale={0.045} />
                <mesh geometry={GEO.capsule()} material={accentMats[i]} position-y={-0.06} scale={[0.095, 0.065, 0.095]} castShadow />
                <group ref={hand[i]} position-y={-0.14}>
                  <mesh geometry={GEO.rbox(1, 1, 1, 0.35)} material={M.dark()} scale={[0.09, 0.08, 0.08]} castShadow />
                  <mesh geometry={GEO.rbox(1, 1, 1, 0.3)} material={M.ivory()} position={[0, -0.02, 0.035]} scale={[0.085, 0.04, 0.03]} />
                  <mesh geometry={GEO.capsule()} material={M.dark()} position={[i === 0 ? -0.045 : 0.045, -0.01, 0.02]} rotation-z={i === 0 ? 0.6 : -0.6} scale={[0.03, 0.03, 0.03]} />
                </group>
              </group>
            </group>
          ))}
        </group>
      </group>
    </group>
  )
}
