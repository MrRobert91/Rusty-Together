import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CapsuleCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import * as RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three'
import { Html } from '@react-three/drei'
import { G, type Mini } from '../runtime'
import { MINI, SLOT_COLOR, SLOT_NAME } from '../tuning'
import { RobotModel, makeView } from './RobotModel'
import { CableView } from './Cable'
import { handPos } from './miniController'
import { sfx } from '../../core/audio'
import { fx } from '../runtime'
import { useVoice } from '../../net/voice'
import { GEO, M } from './materials'

const EMOTE_ICON = ['', '👋', '🎉', '👉', '❓']

export function MiniRobot({ mini, spawn, yaw }: { mini: Mini; spawn: THREE.Vector3; yaw: number }) {
  const wallHands = useMemo(() => [new THREE.Vector3(), new THREE.Vector3()], [])
  const body = useRef<RapierRigidBody>(null)
  const view = useMemo(() => makeView(), [])
  const owned = mini.kind !== 'remote'
  const tag = useRef<HTMLDivElement>(null)
  const bubble = useRef<HTMLDivElement>(null)
  const pingRef = useRef<THREE.Group>(null!)
  const glow = useRef<THREE.Mesh>(null!)
  const stepAcc = useRef(0)
  const lastHidden = useRef<boolean | null>(null)
  const color = SLOT_COLOR[mini.slot]

  useEffect(() => {
    mini.pos.copy(spawn)
    mini.yaw = yaw
    mini.body = body.current
    mini.view = view
    return () => { mini.body = null; mini.view = null }
  }, [mini, spawn, yaw])

  useFrame((_, dt) => {
    const b = body.current
    if (!b) return
    // Enable/disable the body while merged into the big robot.
    const hidden = mini.hidden
    if (hidden !== lastHidden.current) {
      lastHidden.current = hidden
      // Park the disabled body far below: a disabled body can keep a stale
      // contact with the joined body spawned on top of it, which pins the
      // joined body's vertical speed (it would walk on air).
      if (hidden) { const p = b.translation(); b.setTranslation({ x: p.x, y: p.y - 400, z: p.z }, false) }
      b.setEnabled(!hidden)
    }
    view.vel.copy(mini.vel)
    view.yaw = mini.yaw
    view.grounded = mini.grounded
    // Squashed for a moment when the partner springs off our head.
    view.crouch = G.time - mini.stompT < 0.22
    view.offering = mini.offering
    view.hanging = mini.hangOn >= 0
    view.carrying = !!mini.carrying
    view.landT = mini.landT
    view.landImpact = mini.landImpact
    view.jumpT = mini.jumpT
    view.emote = mini.emote
    view.emoteT = mini.emoteT
    view.stun = mini.stunT
    view.now = G.time
    const voice = useVoice.getState()
    const talk = mini.kind === 'local' ? voice.localLevel : mini.kind === 'remote' ? voice.remoteLevel : 0
    view.talk = Math.min(1, talk * 8)
    // Hands: right hand follows the cable / offered glove / partner's glove.
    const c = mini.cable
    view.fistAway[1] = c.state !== 'idle'
    const partner = G.minis[mini.slot === 0 ? 1 : 0]
    if (mini.cling) {
      // Both hands flat on the wall above the head.
      for (let i = 0; i < 2; i++) {
        const side = i === 0 ? 0.22 : -0.22
        wallHands[i].set(mini.pos.x - mini.clingN.x * 0.34 - mini.clingN.z * side, mini.pos.y + 0.42, mini.pos.z - mini.clingN.z * 0.34 + mini.clingN.x * side)
      }
      view.handTargets[0] = wallHands[0]
      view.handTargets[1] = c.state !== 'idle' ? c.tip : wallHands[1]
    } else {
      const towHand = mini.towing ? wallHands[0].set(partner.pos.x, partner.pos.y + 0.25, partner.pos.z) : null
      view.handTargets[1] = c.state !== 'idle' ? c.tip : mini.offering ? mini.glove : mini.hangOn >= 0 ? G.minis[mini.hangOn].glove : towHand
      view.handTargets[0] = mini.hangOn >= 0 ? G.minis[mini.hangOn].glove : null
    }
    view.lookAt = c.state !== 'idle' ? c.tip : partner.hidden ? null : partner.pos.distanceTo(mini.pos) < 8 ? partner.pos : null

    // Footsteps derived from motion (works for local and replicated robots).
    if (mini.grounded && !hidden && !mini.dead) {
      stepAcc.current += Math.hypot(mini.vel.x, mini.vel.z) * dt
      if (stepAcc.current > 0.85) {
        stepAcc.current = 0
        sfx('step', mini.pos)
        fx('particles', { n: 'step', p: { x: mini.pos.x, y: mini.pos.y - MINI.feet + 0.03, z: mini.pos.z } }, false)
      }
    }

    // Emote bubble + name tag.
    if (bubble.current) {
      const et = G.time - mini.emoteT
      const show = mini.emote > 0 && et < 1.8
      bubble.current.style.opacity = show ? '1' : '0'
      bubble.current.style.transform = `translate(-50%, -100%) scale(${show ? 1 + Math.max(0, 0.3 - et) : 0.6})`
      if (show) bubble.current.textContent = EMOTE_ICON[mini.emote]
    }
    if (tag.current) {
      const waiting = mini.coupleHold > 0.05
      tag.current.dataset.state = mini.dead ? 'dead' : waiting ? 'couple' : talk > 0.02 ? 'talk' : ''
      const far = G.cam.pos.distanceTo(mini.pos)
      tag.current.style.opacity = hidden || far > 26 ? '0' : far > 18 ? String((26 - far) / 8) : '1'
    }
    // Ping marker.
    const pg = pingRef.current
    const pt = G.time - mini.pingT
    pg.visible = !!mini.ping && pt < 4
    if (pg.visible && mini.ping) {
      pg.position.copy(mini.ping)
      const s = 1 + Math.max(0, 0.25 - pt) * 4
      pg.scale.set(s, 1, s)
      pg.rotation.y += dt * 2
    }
    // Hand glow while offering (readable "I'm offering" cue).
    glow.current.visible = mini.offering
    if (mini.offering) {
      glow.current.position.copy(mini.glove)
      glow.current.scale.setScalar(0.28 + Math.sin(G.time * 10) * 0.04)
    }
  })

  const handFrom = useMemo(() => {
    const v = new THREE.Vector3()
    return () => (view.handWorld[1].lengthSq() > 0 ? v.copy(view.handWorld[1]) : handPos(mini, v))
  }, [mini, view])

  return (
    <>
      <RigidBody
        ref={body}
        type={owned ? 'dynamic' : 'kinematicPosition'}
        colliders={false}
        enabledRotations={[false, false, false]}
        gravityScale={0}
        ccd={owned}
        canSleep={false}
        position={[spawn.x, spawn.y, spawn.z]}
        userData={{ robot: mini.slot + 1 }}
        mass={owned ? 45 : 1000}
      >
        <CapsuleCollider args={[MINI.halfHeight, MINI.radius]} friction={0} frictionCombineRule={RAPIER.CoefficientCombineRule.Min} restitution={0} />
        <group position-y={-MINI.feet}>
          <RobotModel variant="mini" slot={mini.slot} view={view} visible={() => !mini.hidden && !(mini.dead && G.time - mini.deadT > 0.25)} />
          <Html position={[0, 1.55, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
            <div className="robot-tag-wrap">
              <div ref={bubble} className="emote-bubble" style={{ opacity: 0 }} />
              <div ref={tag} className={`robot-tag slot${mini.slot}`}>{SLOT_NAME[mini.slot]}</div>
            </div>
          </Html>
        </group>
      </RigidBody>
      <CableView cable={() => (mini.hidden ? null : mini.cable)} from={handFrom} color={color} />
      <group ref={pingRef} visible={false}>
        <mesh geometry={GEO.cyl()} material={M.basic(color, 0.35)} scale={[0.25, 14, 0.25]} position-y={7} />
        <mesh geometry={GEO.torus()} material={M.basic(color, 0.9)} rotation-x={Math.PI / 2} scale={0.7} position-y={0.1} />
        <mesh geometry={GEO.cone()} material={M.basic(color, 1)} rotation-x={Math.PI} scale={[0.35, 0.6, 0.35]} position-y={1.6} />
      </group>
      <mesh ref={glow} geometry={GEO.sphereLo()} material={M.basic('#fff6c2', 0.35)} visible={false} />
    </>
  )
}
