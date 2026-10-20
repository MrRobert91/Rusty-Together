import { useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useRapier } from '@react-three/rapier'
import * as THREE from 'three'
import type { World } from '@dimforge/rapier3d-compat'
import { G, localMini, localSlot, onFx, peerMini } from './runtime'
import { commitPrompts, prompt, toast, useHud } from './hud'
import { pickMiniTarget } from './robots/miniController'
import { pickBigTarget } from './robots/bigController'
import { plates } from './Simulation'
import { BIG, MINI, SLOT_NAME } from './tuning'
import { human } from './control'
import { sfx } from '../core/audio'
import { settings } from '../core/settings'

const aim = new THREE.Vector3()
const tmp = new THREE.Vector3()

/**
 * Per-frame contextual prompts and target highlights for the local player.
 * The game teaches itself through these instead of text walls.
 */
export function HudSystem() {
  const { world } = useRapier()

  useEffect(() => {
    const offs = [
      onFx('sfx', (e) => sfx(e.n, e.p, e.v ?? 1)),
      onFx('hint', (e) => toast(e.text, 'warn', 2600)),
      onFx('joint', () => { if (!settings().reduceFlashes) G.cam.shake = Math.min(1, G.cam.shake + 0.2) }),
      onFx('boost', (e) => { if (e.slot === localSlot()) toast('¡Trampolín! Agáchate ({brake}) para lanzar a tu compañero.', 'info', 2000) }),
    ]
    return () => offs.forEach((o) => o())
  }, [])

  useFrame(() => {
    const me = localMini()
    const partner = peerMini()
    const slot = localSlot()
    const now = G.time
    const pn = SLOT_NAME[partner.slot]

    if (G.form === 'split' && !me.hidden && !me.dead) {
      const c = me.cable
      if (me.hangOn >= 0) {
        prompt({ id: 'climb', btn: 'jump', text: 'Trepar' })
        if (partner.hoist > 0) prompt({ id: 'hoisting', text: `${pn} te está subiendo…`, progress: partner.hoist })
      } else if (partner.hangOn === slot) {
        prompt({ id: 'hold', btn: 'grab', hold: true, text: '¡Sujeta! Lo estás subiendo', progress: me.hoist })
      } else if (me.carrying) {
        prompt({ id: 'drop', btn: 'grab', text: 'Soltar caja' })
        prompt({ id: 'throw', btn: 'primary', text: 'Lanzar caja' })
      } else if (c.state === 'attached') {
        if (c.charge > 0.05) prompt({ id: 'launch', btn: 'primary', text: c.charge >= 1 ? '¡Suelta para salir disparado!' : 'Cargando muelle… suelta para saltar', progress: c.charge })
        else prompt({ id: 'reel', btn: 'primary', text: 'Recogiendo… suelta para soltarte' })
        if (!me.grounded) prompt({ id: 'swingjump', btn: 'jump', text: 'Saltar del cable' })
      } else {
        aim.copy(G.cam.fwd)
        aim.y += 0.28
        aim.normalize()
        const pk = c.state === 'idle' ? pickMiniTarget(world as unknown as World, me, aim, partner) : null
        if (pk?.kind === 'anchor' && pk.anchor) {
          pk.anchor.hot[slot] = now
          const what = pk.anchor.kind === 'glove' ? `Agarrar la mano de ${pn}` : pk.anchor.kind === 'bell' ? 'Golpear campana' : pk.anchor.kind === 'latch' ? 'Mantén: enganchar y arrastrar' : 'Mantén: engancharte'
          prompt({ id: 'fire', btn: 'primary', text: what })
        } else if (pk?.kind === 'robot') {
          prompt({ id: 'poke', btn: 'primary', text: `Empujar a ${pn}` })
        }
        if (partner.offering && !partner.hidden) {
          tmp.copy(me.pos).y += 0.5
          const d = tmp.distanceTo(partner.glove)
          if (d < (settings().assist ? MINI.assistGloveRange : MINI.gloveRange) + 0.6) prompt({ id: 'takehand', btn: 'grab', text: `Agarrar la mano de ${pn}` })
        }
        if (me.offering) prompt({ id: 'offer', text: 'Ofreciendo la mano…' })
      }
      // Couple plates.
      for (const p of plates.values()) {
        if (!p.enabled()) continue
        if (Math.hypot(me.pos.x - p.pos.x, me.pos.z - p.pos.z) < p.radius) {
          prompt({ id: 'couple', btn: 'couple', hold: true, text: me.coupleHold > 0 ? `Esperando a ${pn}…` : 'Acoplarse', progress: Math.min(1, me.coupleHold / BIG.coupleHold) })
        }
      }
      if (G.vars.coupleWait === partner.slot) prompt({ id: 'partnerwants', text: `${pn} quiere acoplarse: id a la placa y mantened {couple}` })
    }

    if (G.form === 'joined' && G.big.active) {
      const B = G.big
      const arm = B.arms[slot]
      if (arm.cable.state === 'idle' && !arm.grip) {
        const a = pickBigTarget(world as unknown as World, B, slot, arm.aim)
        if (a) { a.hot[slot] = now; prompt({ id: 'arm', btn: 'primary', text: 'Mantén: lanzar tu brazo' }) }
      } else if (arm.cable.state === 'attached') {
        if (B.tension > 0.95) prompt({ id: 'sling', btn: 'primary', text: '¡Soltad a la vez!' })
        else prompt({ id: 'reelbig', btn: 'primary', text: 'Tensando… suelta para soltar tu brazo' })
      }
      const w = G.vars.splitWait
      if (w === partner.slot) prompt({ id: 'splitwait', text: `${pn} quiere separarse: mantén {couple}` })
      if (human.frame.held.couple) prompt({ id: 'splitme', btn: 'couple', hold: true, text: 'Separarse' })
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
  return null
}
