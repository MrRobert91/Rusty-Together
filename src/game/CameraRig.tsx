import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useRapier } from '@react-three/rapier'
import * as THREE from 'three'
import { G, clamp, damp, dampAngle, localMini, localSlot, onFx, peerMini } from './runtime'
import { human } from './control'
import { setListener } from '../core/audio'
import { settings } from '../core/settings'
import { updateVoiceSpatial } from '../net/voice'
import { raycastPoint } from './robots/physicsUtil'
import { useEffect } from 'react'

export interface CamHint { yaw: number; pitch?: number; dist?: number; height?: number }
/** Levels can steer the joined camera per section. */
export const camHints: { fn: ((p: THREE.Vector3) => CamHint | null) | null } = { fn: null }
export const cameraRef: { current: THREE.PerspectiveCamera | null } = { current: null }

const tmp = new THREE.Vector3()
const tmp2 = new THREE.Vector3()
const desired = new THREE.Vector3()
const dir = new THREE.Vector3()
const hit = new THREE.Vector3()

export function CameraRig() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const { world } = useRapier()
  const st = useRef({ idle: 0, dist: 6.5, target: new THREE.Vector3(), init: false, fov: 55, lookAhead: new THREE.Vector3(), viewYaw: 0, cut: 0 })

  useEffect(() => {
    cameraRef.current = camera
    const off = onFx('shake', (e) => { if (!settings().reduceShake) G.cam.shake = Math.min(1, G.cam.shake + (e.a ?? 0.3)) })
    const off2 = onFx('camCut', () => { st.current.init = false })
    return () => { off(); off2() }
  }, [camera])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const s = st.current
    const C = G.cam
    const joined = G.form === 'joined' || G.form === 'splitting'
    const me = localMini()

    // Focus point (interpolated model position).
    let focusH = 1.05
    if (joined && G.big.view) {
      tmp.copy(G.big.view.rootWorld)
      focusH = 2.3
    } else if (G.form === 'merging') {
      tmp.copy(G.formAt)
      focusH = 1.8
    } else if (me.view) tmp.copy(me.view.rootWorld)
    else tmp.copy(me.pos)
    if (tmp.lengthSq() === 0) tmp.copy(me.pos)
    tmp.y += focusH

    const vel = joined ? G.big.vel : me.vel
    s.lookAhead.x = damp(s.lookAhead.x, vel.x * (joined ? 0.35 : 0.18), 3, dt)
    s.lookAhead.z = damp(s.lookAhead.z, vel.z * (joined ? 0.35 : 0.18), 3, dt)
    s.lookAhead.y = damp(s.lookAhead.y, clamp(vel.y * 0.04, -0.6, 0.3), 3, dt)
    tmp.add(s.lookAhead)

    if (!s.init) {
      s.target.copy(tmp)
      s.init = true
      C.yaw = G.checkpoint ? G.checkpoint.yaw + Math.PI : C.yaw
    }
    s.target.x = damp(s.target.x, tmp.x, 12, dt)
    s.target.z = damp(s.target.z, tmp.z, 12, dt)
    s.target.y = damp(s.target.y, tmp.y, joined ? 4 : 7, dt)

    let pitch = C.pitch
    let dist = 6.5
    if (joined) {
      // Guided shared camera: identical on both clients.
      // Never chase the body's facing (controls are camera-relative, that would
      // spiral); only level-authored hints rotate the shared view.
      const hint = camHints.fn ? camHints.fn(G.big.pos) : null
      if (hint) C.yaw = dampAngle(C.yaw, hint.yaw, 1.4, dt)
      pitch = hint?.pitch ?? 0.36
      dist = hint?.dist ?? 10.5
      C.pitch = damp(C.pitch, pitch, 2, dt)
      pitch = C.pitch
    } else {
      const lx = human.look.x
      const ly = human.look.y
      C.yaw += lx
      C.pitch = clamp(C.pitch - ly, -0.25, 1.15)
      pitch = C.pitch
      const moving = Math.hypot(me.vel.x, me.vel.z) > 1
      if (Math.abs(lx) + Math.abs(ly) > 0.0005) s.idle = 0
      else s.idle += dt
      if (moving && s.idle > 1.4 && me.cable.state === 'idle') {
        C.yaw = dampAngle(C.yaw, me.yaw + Math.PI, 0.9, dt)
        C.pitch = damp(C.pitch, 0.3, 0.6, dt)
      }
      dist = 6.5 + clamp(-me.vel.y * 0.04, 0, 1.2)
    }
    s.dist = damp(s.dist, dist, 3, dt)

    const cp = Math.cos(pitch)
    desired.set(Math.sin(C.yaw) * cp, Math.sin(pitch), Math.cos(C.yaw) * cp)
    // Keep the camera out of walls.
    dir.copy(desired)
    const body = joined ? G.big.body : me.body
    const d = raycastPoint(world, s.target, dir, s.dist + 0.4, body, hit)
    const realDist = d > 0 ? Math.max(1.2, d - 0.4) : s.dist
    C.pos.copy(s.target).addScaledVector(desired, realDist)

    // Shake.
    C.shake = Math.max(0, C.shake - dt * 2.2)
    if (C.shake > 0 && !settings().reduceShake) {
      const a = C.shake * C.shake * 0.35
      const t = G.time * 40
      C.pos.x += Math.sin(t * 1.3) * a
      C.pos.y += Math.sin(t * 1.7 + 1) * a
      C.pos.z += Math.sin(t * 1.1 + 2) * a
    }

    camera.position.copy(C.pos)
    camera.lookAt(s.target)
    C.target.copy(s.target)
    camera.getWorldDirection(C.fwd)
    const speed = joined ? 0 : Math.hypot(me.vel.x, me.vel.z)
    s.fov = damp(s.fov, 55 + clamp(speed - 5, 0, 10) * 0.8, 3, dt)
    if (Math.abs(camera.fov - s.fov) > 0.01) { camera.fov = s.fov; camera.updateProjectionMatrix() }

    // Audio listener + proximity voice.
    setListener(camera.position, C.fwd)
    const partner = peerMini()
    const myPos = joined ? G.big.pos : me.pos
    const theirPos = joined ? G.big.pos : partner.pos
    const head = joined ? G.big.view?.headWorld : partner.view?.headWorld
    tmp2.copy(head && head.lengthSq() > 0 ? head : theirPos)
    updateVoiceSpatial(camera.position, C.fwd, tmp2, joined ? 0 : myPos.distanceTo(theirPos))
    void localSlot
  }, 1)

  return null
}
