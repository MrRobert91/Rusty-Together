import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useRapier } from '@react-three/rapier'
import * as THREE from 'three'
import type { World } from '@dimforge/rapier3d-compat'
import { G, localMini, localSlot, onFx, peerMini, plateUnder } from './runtime'
import { commitPrompts, prompt, toast, useHud } from './hud'
import { canTow, nearestBox, pickMiniTarget, pickPunchTarget } from './robots/miniController'
import { pickBigPunch, pickBigTarget, shoulderPos } from './robots/bigController'
import { BIG, BTN_COLOR, MINI, SLOT_NAME } from './tuning'
import { human } from './control'
import { sfx } from '../core/audio'
import { settings } from '../core/settings'
import { GEO, M } from './robots/materials'

const aim = new THREE.Vector3()
const tmp = new THREE.Vector3()

/** Where each button would act this frame (drawn as a glowing marker in its colour). */
type Mark = { on: boolean; pos: THREE.Vector3; flat: number }
const marks: Record<'context' | 'grab' | 'punch', Mark> = {
  context: { on: false, pos: new THREE.Vector3(), flat: 0 },
  grab: { on: false, pos: new THREE.Vector3(), flat: 0 },
  punch: { on: false, pos: new THREE.Vector3(), flat: 0 },
}
const mark = (k: keyof typeof marks, p: THREE.Vector3, flat = 0) => { marks[k].on = true; marks[k].pos.copy(p); marks[k].flat = flat }

let stompTold = false

/**
 * Per-frame contextual prompts and target highlights for the local player.
 * The game teaches itself through these instead of text walls, and anything
 * a button can act on glows in that button's colour.
 */
export function HudSystem() {
  const { world } = useRapier()

  useEffect(() => {
    const offs = [
      onFx('sfx', (e) => sfx(e.n, e.p, e.v ?? 1)),
      onFx('hint', (e) => toast(e.text, 'warn', 2600)),
      onFx('joint', () => { if (!settings().reduceFlashes) G.cam.shake = Math.min(1, G.cam.shake + 0.2) }),
      onFx('boost', (e) => {
        const base = G.minis[e.slot as 0 | 1]
        if (base) base.stompT = G.time
        if (!stompTold && e.slot !== localSlot()) { stompTold = true; toast('¡Trampolín! Saltar sobre la cabeza de tu compañero te lanza más alto.', 'info', 2400) }
      }),
    ]
    return () => offs.forEach((o) => o())
  }, [])

  useFrame(() => {
    const me = localMini()
    const partner = peerMini()
    const slot = localSlot()
    const now = G.time
    const pn = SLOT_NAME[partner.slot]
    const w = world as unknown as World
    marks.context.on = marks.grab.on = marks.punch.on = false

    if (G.form === 'split' && !me.hidden && !me.dead) {
      const c = me.cable
      const dragged = partner.towing && partner.hangOn < 0
      if (me.hangOn >= 0) {
        prompt({ id: 'climb', btn: 'jump', text: 'Trepar' })
        if (partner.hoist > 0) prompt({ id: 'hoisting', text: `${pn} te está subiendo…`, progress: partner.hoist })
      } else if (partner.hangOn === slot) {
        prompt({ id: 'hold', btn: 'grab', hold: true, text: '¡Sujeta! Lo estás subiendo', progress: me.hoist })
      } else if (me.cling) {
        prompt({ id: 'walljump', btn: 'jump', text: 'Salto de pared' })
        prompt({ id: 'clinghold', btn: 'grab', hold: true, text: 'Agarrado a la pared', progress: 1 - Math.min(1, me.clingT / MINI.clingTime) })
      } else if (me.carrying) {
        prompt({ id: 'drop', btn: 'grab', text: 'Soltar caja' })
        prompt({ id: 'throw', btn: 'punch', text: 'Lanzar caja' })
      } else if (me.towing) {
        prompt({ id: 'tow', btn: 'grab', hold: true, text: `Arrastrando a ${pn}` })
        mark('grab', partner.pos)
      } else if (c.state === 'attached' && !c.punch) {
        if (c.charge > 0.05) prompt({ id: 'launch', btn: 'context', text: c.charge >= 1 ? '¡Suelta para salir disparado!' : 'Cargando muelle… suelta para saltar', progress: c.charge })
        else prompt({ id: 'reel', btn: 'context', text: 'Recogiendo… suelta para soltarte' })
        if (!me.grounded) prompt({ id: 'swingjump', btn: 'jump', text: 'Saltar del cable' })
      } else {
        // Contextual: a couple plate under your feet wins over hooks.
        const plate = me.grounded ? plateUnder(me) : null
        if (plate) {
          mark('context', tmp.copy(plate.pos).setY(plate.pos.y + 0.12), plate.radius * 0.8)
          prompt({ id: 'couple', btn: 'context', hold: true, text: me.coupleHold > 0 ? `Esperando a ${pn}…` : 'Acoplarse', progress: Math.min(1, me.coupleHold / BIG.coupleHold) })
        } else if (c.state === 'idle') {
          aim.copy(G.cam.fwd)
          aim.y += 0.28
          aim.normalize()
          const pk = pickMiniTarget(w, me, aim, partner)
          if (pk.kind === 'anchor' && pk.anchor) {
            pk.anchor.hot[slot] = now
            mark('context', pk.anchor.pos)
            const what = pk.anchor.kind === 'glove' ? `Enganchar la mano de ${pn}` : pk.anchor.kind === 'latch' ? 'Mantén: enganchar y arrastrar' : 'Mantén: engancharte'
            prompt({ id: 'fire', btn: 'context', text: what })
          }
        }
        // Punch targets.
        if (c.state === 'idle') {
          const pp = pickPunchTarget(w, me, partner)
          if (pp.kind === 'anchor' && pp.anchor) {
            mark('punch', pp.anchor.pos)
            const k = pp.anchor.kind
            prompt({ id: 'punch', btn: 'punch', text: k === 'bell' ? 'Golpear campana' : k === 'button' ? 'Pulsar el botón' : '¡Pégale!' })
          } else if (pp.kind === 'robot' && G.vars.arenaLive) {
            prompt({ id: 'punch', btn: 'punch', text: `Empujar a ${pn}` })
          }
        }
        // Grab targets: offered hand, box, or the partner's body.
        const gloveR = (settings().assist ? MINI.assistGloveRange : MINI.gloveRange) + 0.6
        if (partner.offering && !partner.hidden && tmp.copy(me.pos).setY(me.pos.y + 0.5).distanceTo(partner.glove) < gloveR) {
          mark('grab', partner.glove)
          prompt({ id: 'takehand', btn: 'grab', text: `Agarrar la mano de ${pn}` })
        } else if (!me.offering && me.grounded) {
          const box = nearestBox(me)
          const nb = box ? G.bodies.get(box) : null
          if (nb) {
            const p = nb.body.translation()
            mark('grab', tmp.set(p.x, p.y + 0.55, p.z))
            prompt({ id: 'takebox', btn: 'grab', text: 'Coger caja' })
          } else if (canTow(me, partner) && !dragged) {
            mark('grab', tmp.copy(partner.pos).setY(partner.pos.y + 0.75))
            prompt({ id: 'towit', btn: 'grab', hold: true, text: `Agarrar a ${pn}` })
          }
        }
        if (me.offering) prompt({ id: 'offer', text: 'Ofreciendo la mano…' })
      }
      if (dragged) prompt({ id: 'dragged', text: `${pn} te lleva a rastras` })
      if (G.vars.coupleWait === partner.slot) prompt({ id: 'partnerwants', text: `${pn} quiere acoplarse: id a la placa y mantened {context}` })
    }

    if (G.form === 'joined' && G.big.active) {
      const B = G.big
      const arm = B.arms[slot]
      if (arm.cable.state === 'idle' && !arm.grip) {
        const a = pickBigTarget(w, B, slot, arm.aim)
        if (a) { a.hot[slot] = now; mark('context', a.pos); prompt({ id: 'arm', btn: 'context', text: 'Mantén: lanzar tu brazo' }) }
        const p = pickBigPunch(B, shoulderPos(B, slot, tmp))
        if (p) { mark('punch', p.pos); prompt({ id: 'bigpunch', btn: 'punch', text: p.kind === 'bell' ? 'Golpear campana' : p.kind === 'button' ? 'Pulsar el botón' : '¡Pégale!' }) }
        if (!a && human.frame.held.context && B.grounded) prompt({ id: 'splitme', btn: 'context', hold: true, text: 'Separarse' })
      } else if (arm.cable.state === 'attached' && !arm.cable.punch) {
        if (B.tension > 0.95) prompt({ id: 'sling', btn: 'context', text: '¡Soltad a la vez!' })
        else prompt({ id: 'reelbig', btn: 'context', text: 'Tensando… suelta para soltar tu brazo' })
      }
      if (G.vars.splitWait === partner.slot) prompt({ id: 'splitwait', text: `${pn} quiere separarse: mantén {context} en suelo ancho` })
      if (B.dead) prompt({ id: 'respawn', text: 'Reapareciendo…' })
    }

    if (me.dead && G.form === 'split') prompt({ id: 'respawn', text: 'Reapareciendo en el último refugio…' })

    // HUD pilot indicators.
    const B = G.big
    const hud = useHud.getState()
    const legs: [{ x: number; y: number }, { x: number; y: number }] = [
      { x: B.legs[0].move.x, y: B.legs[0].move.z }, { x: B.legs[1].move.x, y: B.legs[1].move.z },
    ]
    if (G.form === 'joined' && (Math.abs(hud.pilotReady[0] - B.ready[0]) > 0.05 || Math.abs(hud.pilotReady[1] - B.ready[1]) > 0.05 || Math.abs(hud.tension - B.tension) > 0.03 ||
      Math.abs(hud.pilotLegs[0].x - legs[0].x) + Math.abs(hud.pilotLegs[0].y - legs[0].y) + Math.abs(hud.pilotLegs[1].x - legs[1].x) + Math.abs(hud.pilotLegs[1].y - legs[1].y) > 0.1)) {
      useHud.setState({ pilotReady: [B.ready[0], B.ready[1]], tension: B.tension, pilotLegs: legs })
    }
    commitPrompts()
  })
  return <TargetMarkers />
}

/**
 * Glowing rings in the colour of the button that acts on the target: violet
 * for the contextual button, blue for grab, red for punch. They face the
 * camera (or lie flat on a couple plate) and pulse so they read at a glance.
 */
function TargetMarkers() {
  const refs = { context: useRef<THREE.Group>(null!), grab: useRef<THREE.Group>(null!), punch: useRef<THREE.Group>(null!) }
  const q = new THREE.Quaternion()
  const flatQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)
  useFrame(({ camera }) => {
    const t = performance.now() / 1000
    for (const k of ['context', 'grab', 'punch'] as const) {
      const g = refs[k].current
      const mk = marks[k]
      g.visible = mk.on
      if (!mk.on) continue
      g.position.copy(mk.pos)
      const pulse = 1 + Math.sin(t * 9) * 0.08
      if (mk.flat > 0) { g.quaternion.copy(flatQ); g.scale.setScalar(mk.flat * pulse) }
      else { g.quaternion.copy(q.copy(camera.quaternion)); g.scale.setScalar((k === 'context' ? 0.62 : 0.5) * pulse) }
      g.children[1].rotation.z = t * (k === 'grab' ? -2 : 2.5)
    }
  })
  return (
    <>
      {(['context', 'grab', 'punch'] as const).map((k) => (
        <group key={k} ref={refs[k]} visible={false} renderOrder={10}>
          <mesh geometry={GEO.ringFlat()} material={markMat(k, 0.95)} />
          <group>
            {[0, 1, 2, 3].map((i) => (
              <mesh key={i} geometry={GEO.box()} material={markMat(k, 0.9)} position={[Math.cos((i * Math.PI) / 2) * 1.25, Math.sin((i * Math.PI) / 2) * 1.25, 0]} rotation-z={(i * Math.PI) / 2 + Math.PI / 4} scale={[0.22, 0.22, 0.02]} />
            ))}
          </group>
        </group>
      ))}
    </>
  )
}

const markMats = new Map<string, THREE.Material>()
function markMat(k: 'context' | 'grab' | 'punch', opacity: number) {
  const key = k + opacity
  let m = markMats.get(key)
  if (!m) {
    m = M.basic(BTN_COLOR[k], opacity).clone()
    ;(m as THREE.MeshBasicMaterial).depthTest = false
    ;(m as THREE.MeshBasicMaterial).transparent = true
    markMats.set(key, m)
  }
  return m
}
