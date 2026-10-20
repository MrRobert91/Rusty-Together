import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { Block, Banner, Scaffold, Tree, HazardStrip } from '../env/blocks'
import { Beacon, CouplePlate, Crate, Gate, Ring, SafetyNet, Sign, Switch } from '../env/interactive'
import { defineCheckpoints, reachCheckpoint } from './checkpoints'
import { PresentationBridge, say, useHostLogic, useJoinedSafeZones } from './common'
import { G, fx, localMini } from '../runtime'
import { aiDriver } from '../Simulation'
import { brain, companionMini, companionPilot, resetBrain } from '../ai/companion'
import { hostSet } from '../net/replication'
import { useHud } from '../hud'
import { BIG, MINI } from '../tuning'
import { sfx, setMusic } from '../../core/audio'
import { Finish } from './Finish'
import { backdropCfg } from '../env/Atmosphere'

/*
 * Taller de pruebas — solo tutorial with Ámbar-bot.
 * The path runs along -Z. Each beat teaches one verb, then the bot joins in
 * to teach the cooperative ones (springboard, offered hand, mid-air rescue,
 * coupling, unilateral vs joint jump, slingshot, splitting).
 */

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

export function setupTutorial() {
  backdropCfg.cx = 0
  backdropCfg.cz = -65
  backdropCfg.inner = 80
  const bot = V(2.2, 5.5, -60) // Ámbar-bot naps here until you arrive
  defineCheckpoints([
    { id: 't0', room: 0, a: [0, 1, -2], b: bot.toArray(), yaw: Math.PI },
    { id: 't1', room: 1, a: [0, 1, -19], b: bot.toArray(), yaw: Math.PI },
    { id: 't2', room: 2, a: [0, 2, -24], b: bot.toArray(), yaw: Math.PI },
    { id: 't3', room: 3, a: [0, 2, -35], b: bot.toArray(), yaw: Math.PI },
    { id: 't4', room: 4, a: [0, 2, -47], b: bot.toArray(), yaw: Math.PI },
    { id: 't5', room: 5, a: [-1.5, 6, -58], b: bot.toArray(), yaw: Math.PI },
    { id: 't6', room: 6, a: [-1, 8.4, -72], b: [1.5, 6, -66], yaw: Math.PI },
    { id: 't7', room: 7, a: [-1, 8.4, -76], b: [1.5, 8.4, -76], yaw: Math.PI },
    { id: 't8', room: 8, a: [-1.4, 8.4, -88], b: [1.4, 8.4, -88], yaw: Math.PI, joined: [0, 7.4, -92] },
    { id: 't9', room: 9, a: [-1.4, 8.4, -125], b: [1.4, 8.4, -125], yaw: Math.PI, joined: [0, 7.4, -110] },
  ])
  resetBrain()
  aiDriver.mini = companionMini
  aiDriver.pilot = (rp, lp) => companionPilot(rp, lp)
}

type Step = 'move' | 'jump' | 'high' | 'box' | 'swing' | 'spring' | 'meet' | 'boost' | 'hand' | 'cross' | 'catch' | 'couple' | 'walk' | 'hop' | 'joint' | 'sling' | 'split' | 'done'

const OBJ: Record<Step, string> = {
  move: 'Camina hasta el borde de la pasarela (WASD / stick izquierdo). Mira con el ratón.',
  jump: 'Salta el hueco (Espacio / A). Si caes, la red te devuelve.',
  high: 'Mantén el salto para llegar más alto y sube al escalón.',
  box: 'Coge la caja (E / RT), déjala sobre el botón y cruza la puerta.',
  swing: 'Lanza el puño cableado al anillo (clic / X), balancéate y suelta al final.',
  spring: 'Engancha el anillo del muro, mantén LT (clic derecho) para recoger y cargar el muelle… ¡y suéltalo!',
  meet: 'Despierta a Ámbar-bot.',
  boost: 'Ámbar se agacha: salta sobre su cabeza para usarla de trampolín y sube al muro.',
  hand: 'Arriba, ponte en el borde mirando a Ámbar y mantén RT (E) para ofrecerle la mano.',
  cross: 'Ámbar cruza primero y te ofrece la mano…',
  catch: 'Salta hacia Ámbar y agarra su mano en el aire (E / RT). También puedes lanzarle el puño (X).',
  couple: 'Subid juntos a la placa y mantened Y (R) para acoplaros.',
  walk: 'Unidos: tu stick mueve tu pierna izquierda. Ámbar te sigue el paso. Caminad hasta el primer hueco.',
  hop: 'Pulsa A tú solo: un bote unilateral basta para este hueco pequeño.',
  joint: 'Ahora Ámbar saltará contigo: pulsad A a la vez para el salto conjunto.',
  sling: 'Lanzad los brazos a los dos anillos (X), tensad (LT) hasta el máximo y disparad a la vez (X).',
  split: 'Mantened Y (R) para separaros sobre suelo ancho.',
  done: '¡Taller completado!',
}

export function Tutorial() {
  const st = useRef({ step: 'move' as Step, t: 0, said: new Set<string>() })

  useEffect(() => {
    setMusic('explore')
    say.objective(OBJ.move)
    say.room('0', 'Taller de pruebas', 'Tutorial · Un jugador')
  }, [])

  useJoinedSafeZones([
    { c: [0, 7.4, -94], half: [5, 3], respawn: [0, 7.4, -93], yaw: Math.PI },
    { c: [0, 7.4, -101.2], half: [3.5, 3], respawn: [0, 7.4, -101.2], yaw: Math.PI },
    { c: [0, 7.4, -110.2], half: [3.5, 3], respawn: [0, 7.4, -109.5], yaw: Math.PI },
  ])

  useHostLogic((dt) => {
    const s = st.current
    s.t += dt
    const me = localMini()
    const bot = G.minis[1]
    const p = me.pos
    const feet = p.y - MINI.feet
    const go = (n: Step) => {
      s.step = n
      s.t = 0
      say.objective(OBJ[n])
      hostSet('tstep', n)
    }
    const once = (k: string, f: () => void) => { if (!s.said.has(k)) { s.said.add(k); f() } }

    switch (s.step) {
      case 'move':
        if (p.z < -11) go('jump')
        break
      case 'jump':
        if (p.z < -16.5 && me.grounded) { reachCheckpoint('t1'); go('high') }
        break
      case 'high':
        if (feet > 0.9 && p.z < -22.5 && me.grounded) { reachCheckpoint('t2'); go('box') }
        break
      case 'box':
        if (G.vars['sw:t_box']) once('boxok', () => say.toast('¡Puerta abierta! El peso de la caja mantiene el botón.', 'good'))
        if (p.z < -33 && me.grounded) { reachCheckpoint('t3'); go('swing') }
        break
      case 'swing':
        if (me.cable.state === 'attached') once('reelhint', () => say.toast('Balancéate con el stick. Suelta con X o salta con A al final del arco.', 'info'))
        if (p.z < -45 && me.grounded && feet > 0.5) { reachCheckpoint('t4'); go('spring'); G.medals.add('tutorial') }
        break
      case 'spring':
        if (feet > 4.5 && me.grounded) { reachCheckpoint('t5'); go('meet') }
        break
      case 'meet':
        if (p.distanceTo(bot.pos) < 4.5) {
          brain.setMode({ k: 'crouch', at: V(1.0, 5, -67.4) })
          say.sub('Ámbar-bot', '¡Bip-bip! (¡Hola, Cian! ¿Me ayudas a subir?)', '#ffd27a')
          bot.emote = 1
          bot.emoteT = G.time
          fx('sfx', { n: 'beepAmber', p: bot.pos })
          useHud.getState().set({ roomTitle: null })
          say.room('5', 'Ámbar-bot', 'Cooperación')
          go('boost')
        }
        break
      case 'boost':
        if (feet > 7 && me.grounded && p.z < -68.6) {
          reachCheckpoint('t6')
          brain.setMode({ k: 'grabUp', under: V(0, 5, -68) })
          say.sub('Ámbar-bot', '¡Bip! (¡Échame una mano!)', '#ffd27a')
          go('hand')
        }
        break
      case 'hand':
        if (bot.pos.y - MINI.feet > 7 && bot.grounded && bot.pos.z < -68.9 && bot.hangOn < 0) {
          reachCheckpoint('t7')
          say.banner('¡Rescate!', 'Has subido a tu compañero', '#5dff8a')
          sfx('success')
          brain.setMode({ k: 'cross', from: V(2.5, 7.4, -80.6), ring: 't_cross', to: V(2.5, 7.4, -88), then: { k: 'offer', at: V(0, 7.4, -85.75), face: 0 } })
          go('cross')
        }
        break
      case 'cross':
        if (bot.offering) {
          say.sub('Ámbar-bot', '¡Bip-bip! (¡Salta, te cojo!)', '#ffd27a')
          go('catch')
        }
        break
      case 'catch':
        if (feet > 7 && p.z < -85.4 && me.grounded) {
          reachCheckpoint('t8')
          say.banner('¡Os tenéis el uno al otro!', undefined, '#ffd23a')
          sfx('success')
          brain.setMode({ k: 'couple', at: V(0, 7.4, -91) })
          go('couple')
        }
        break
      case 'couple':
        if (G.form === 'joined') {
          say.room('6', 'Un solo cuerpo', 'Unidos')
          brain.pilot = { jump: 'none', arms: 'none' }
          go('walk')
        }
        break
      case 'walk':
        if (G.big.pos.z < -95.5) go('hop')
        break
      case 'hop':
        if (G.big.grounded && G.big.pos.z < -98.8 && G.big.pos.z > -104.5) {
          brain.pilot = { jump: 'sync', arms: 'none' }
          say.toast('¡Bote unilateral! Pequeño pero seguro.', 'good')
          go('joint')
        }
        break
      case 'joint':
        if (G.big.grounded && G.big.pos.z < -107.5) {
          brain.pilot = { jump: 'sync', arms: 'sync' }
          say.banner('¡Salto conjunto!', undefined, '#ffd23a')
          go('sling')
        }
        break
      case 'sling':
        if (G.big.grounded && G.big.pos.z < -121) {
          reachCheckpoint('t9')
          say.banner('¡Tirachinas!', 'Brazos, tensión y dos confirmaciones', '#ffd23a')
          go('split')
        }
        break
      case 'split':
        if (G.form === 'split' && s.t > 0.3) {
          brain.setMode({ k: 'follow' })
          go('done')
        }
        break
      case 'done':
        break
    }
    void BIG
  })

  return (
    <>
      <PresentationBridge />
      {/* T0 start */}
      <Block pos={[0, 0, -6]} size={[12, 8, 16]} />
      <Sign pos={[-4, 2.2, -3]} rotY={0.3} text="Taller de pruebas" sub="Muévete y mira a tu alrededor" />
      <Tree pos={[4.5, 0, 0]} s={1.1} />
      <Scaffold pos={[-9, -8, -4]} h={14} />
      <Banner pos={[5.8, 3.2, -10]} rotY={-Math.PI / 2} />
      <HazardStrip pos={[0, 0.03, -13.6]} size={[12, 0.6]} />

      {/* T1 jump */}
      <SafetyNet pos={[0, -1.8, -15]} size={[8, 2.6]} returnTo={[0, 0, -12]} />
      <Block pos={[0, 0, -19]} size={[8, 8, 6]} />
      <Sign pos={[3, 2.2, -18]} rotY={-0.4} text="Salta" sub="mantén para llegar más alto" small />

      {/* T2 high step + T3 crate door */}
      <Block pos={[0, 1, -27]} size={[8, 9, 10]} />
      <Crate id="box-t" pos={[2.4, 1.6, -25]} />
      <Switch id="t_box" pos={[-2.2, 1, -29.4]} radius={0.85} crates robots={false} />
      <Sign pos={[-2.2, 3, -30.6]} text="Caja aquí" sub="coge con E / RT" small />
      <Gate pos={[0, 1, -31.7]} size={[7.6, 2.8, 0.5]} openVar="sw:t_box" />

      {/* T4 swing */}
      <Block pos={[0, 1, -36]} size={[8, 9, 8]} />
      <Ring id="t_swing" pos={[0, 4.4, -42.2]} mount="hang" big={false} />
      <SafetyNet pos={[0, -1, -42]} size={[8, 4]} returnTo={[0, 1, -38]} />
      <Sign pos={[3.2, 3.2, -38.5]} rotY={-0.4} text="Puño cableado" sub="X / clic: lánzalo al anillo" small />
      <Block pos={[0, 1, -49.75]} size={[8, 9, 11.5]} />

      {/* T5 spring launch up the cliff */}
      <Block pos={[0, 5, -62]} size={[12, 13, 13]} />
      <Ring id="t_wall" pos={[0, 4.3, -55.15]} mount="wall" big={false} facing={0} />
      <Sign pos={[-3, 3.4, -52]} rotY={0.4} text="Muelle" sub="mantén LT y suelta" small />
      <Tree pos={[-4.5, 5, -64]} />
      <Beacon pos={[4.5, 5, -58]} id="t5" />

      {/* T6 springboard wall + hand */}
      <Block pos={[0, 7.4, -75]} size={[10, 15, 13]} />
      <Sign pos={[-3.2, 7.2, -66.8]} text="Trampolín" sub="salta sobre Ámbar agachado" small />
      <Banner pos={[4.6, 10.4, -69]} rotY={0} />

      {/* T7 reverse: bot crosses, you catch its hand */}
      <Ring id="t_cross" pos={[2.5, 11.2, -83.3]} mount="hang" big={false} />
      <SafetyNet pos={[0, 4.8, -83.3]} size={[10, 3.6]} returnTo={[0, 7.4, -79.5]} />
      <Block pos={[0, 7.4, -91]} size={[10, 15, 12]} />
      <CouplePlate id="t_plate" pos={[0, 7.42, -91.5]} yaw={Math.PI} />
      <Sign pos={[4, 9.6, -90]} rotY={-0.5} text="Placa de unión" sub="mantened Y juntos" small />

      {/* T8 joined: hop gap (1.2 m), joint gap (3 m) */}
      <Block pos={[0, 7.4, -101.2]} size={[7, 14, 6]} />
      <Block pos={[0, 7.4, -110.2]} size={[7, 14, 6]} />
      <Sign pos={[4.2, 9.6, -99.5]} rotY={-0.6} text="Bote" sub="un solo impulso" small />
      <Sign pos={[4.2, 9.6, -108.5]} rotY={-0.6} text="Conjunto" sub="A a la vez" small />

      {/* T9 slingshot to the finish */}
      <Ring id="t_slingL" pos={[1.7, 12.2, -114.2]} mount="hang" mini={false} sling={{ group: 'tsl', to: V(0, 7.4, -127), time: 1.5 }} />
      <Ring id="t_slingR" pos={[-1.7, 12.2, -114.2]} mount="hang" mini={false} sling={{ group: 'tsl', to: V(0, 7.4, -127), time: 1.5 }} />
      <Scaffold pos={[0, 7.4, -114.2]} w={5.2} d={1} h={6} />
      <Block pos={[0, 7.4, -128]} size={[12, 14, 12]} />
      <Finish pos={[0, 7.4, -131]} active={() => G.vars.tstep === 'done'} onDone={() => G.medals.add('tutorial')} label="¡Taller superado!" />
      <Tree pos={[-4.5, 7.4, -132]} s={1.2} />
      <Tree pos={[4.8, 7.4, -126]} s={0.9} />
    </>
  )
}
