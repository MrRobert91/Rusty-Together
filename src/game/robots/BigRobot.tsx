import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CapsuleCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import * as RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three'
import { G, isHost } from '../runtime'
import { BIG, COLORS } from '../tuning'
import { RobotModel, makeView } from './RobotModel'
import { CableView } from './Cable'
import { shoulderPos } from './bigController'
import { sfx } from '../../core/audio'
import { fx } from '../runtime'
import { useVoice } from '../../net/voice'
import { GEO, M } from './materials'

/** The joined robot: 2.2 m, left half Cian, right half Ámbar. */
export function BigRobot() {
  const body = useRef<RapierRigidBody>(null)
  const view = useMemo(() => makeView(), [])
  const host = isHost()
  const B = G.big
  const lastActive = useRef<boolean | null>(null)
  const stepAcc = useRef(0)
  const aimLines = [useRef<THREE.Mesh>(null!), useRef<THREE.Mesh>(null!)]
  const springs = [useRef<THREE.Mesh>(null!), useRef<THREE.Mesh>(null!)]

  useEffect(() => {
    B.body = body.current
    B.view = view
    body.current?.setEnabled(false)
    return () => { B.body = null; B.view = null }
  }, [B])

  useFrame((_, dt) => {
    const b = body.current
    if (!b) return
    if (B.active !== lastActive.current) {
      lastActive.current = B.active
      b.setEnabled(B.active)
    }
    view.vel.copy(B.vel)
    view.yaw = B.yaw
    view.grounded = B.grounded
    view.crouch = B.legs[0].anchored && B.legs[1].anchored
    view.landT = B.landT
    view.landImpact = B.landImpact
    view.jumpT = B.jumpT
    view.now = G.time
    view.stun = B.stunT
    view.torsion = B.torsion
    view.legPush = [B.legs[0].anchored ? -1 : 0, B.legs[1].anchored ? -1 : 0]
    view.carrying = !!B.carrying
    const v = useVoice.getState()
    view.talk = Math.min(1, (v.localLevel + v.remoteLevel) * 6)
    for (let i = 0; i < 2; i++) {
      const arm = B.arms[i]
      const c = arm.cable
      view.fistAway[i] = c.state !== 'idle'
      const grip = arm.grip ? G.anchors.get(arm.grip)?.pos ?? null : null
      view.handTargets[i] = c.state !== 'idle' ? c.tip : grip
    }
    view.hanging = B.arms.some((a) => a.cable.state === 'attached') && !B.grounded
    view.expression = B.tension > 0.95 ? 'determined' : B.jumpKind === 'joint' && !B.grounded ? 'happy' : undefined

    if (B.grounded && B.active) {
      stepAcc.current += Math.hypot(B.vel.x, B.vel.z) * dt
      if (stepAcc.current > 1.5) {
        stepAcc.current = 0
        sfx('stepHeavy', B.pos)
        fx('particles', { n: 'step', p: { x: B.pos.x, y: B.pos.y - BIG.feet + 0.05, z: B.pos.z }, s: 2 }, false)
      }
    }

    // Aim guides: a faint line from each shoulder in that pilot's colour.
    const tmp = new THREE.Vector3()
    for (let i = 0; i < 2; i++) {
      const m = aimLines[i].current
      const arm = B.arms[i]
      m.visible = B.active && arm.cable.state === 'idle' && !arm.grip
      if (m.visible) {
        shoulderPos(B, i, tmp)
        m.position.copy(tmp).addScaledVector(arm.aim, 1.6)
        m.lookAt(tmp.addScaledVector(arm.aim, 4))
      }
      const s = springs[i].current
      s.visible = B.tension > 0.05
      if (s.visible) {
        s.position.copy(view.handWorld[i])
        s.scale.setScalar(0.18 + B.tension * 0.12)
        ;(s.material as THREE.MeshBasicMaterial).color.set(B.tension > 0.95 ? '#ffd23a' : '#ffffff')
      }
    }
  })

  const from = (i: number) => {
    const v = new THREE.Vector3()
    return () => v.copy(view.handWorld[i])
  }
  const f0 = useMemo(() => from(0), []) // eslint-disable-line react-hooks/exhaustive-deps
  const f1 = useMemo(() => from(1), []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <RigidBody
        ref={body}
        type={host ? 'dynamic' : 'kinematicPosition'}
        colliders={false}
        enabledRotations={[false, false, false]}
        gravityScale={0}
        ccd
        canSleep={false}
        position={[0, -100, 0]}
        userData={{ robot: 3 }}
        mass={160}
      >
        <CapsuleCollider args={[BIG.halfHeight, BIG.radius]} friction={0} frictionCombineRule={RAPIER.CoefficientCombineRule.Min} />
        <group position-y={-BIG.feet}>
          <RobotModel variant="big" slot={0} view={view} visible={() => B.active && !(B.dead && G.time - B.deadT > 0.25)} />
        </group>
      </RigidBody>
      <CableView cable={() => (B.active ? B.arms[0].cable : null)} from={f0} color={COLORS.cyan} thick={6} fistScale={2} />
      <CableView cable={() => (B.active ? B.arms[1].cable : null)} from={f1} color={COLORS.amber} thick={6} fistScale={2} />
      {[0, 1].map((i) => (
        <mesh key={i} ref={aimLines[i]} geometry={GEO.box()} material={M.basic(i === 0 ? COLORS.cyan : COLORS.amber, 0.4)} scale={[0.035, 0.035, 2.6]} visible={false} />
      ))}
      {[0, 1].map((i) => (
        <mesh key={i} ref={springs[i]} geometry={GEO.torus()} material={new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false })} visible={false} />
      ))}
    </>
  )
}
