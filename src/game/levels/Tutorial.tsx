import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { Block, Banner, Scaffold, Tree, HazardStrip } from '../env/blocks'
import { Beacon, CouplePlate, Crate, Gate, PunchButton, Ring, SafetyNet, Sign, Switch } from '../env/interactive'
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

type Step = 'move' | 'jump' | 'high' | 'box' | 'punch' | 'swing' | 'spring' | 'meet' | 'boost' | 'hand' | 'cross' | 'catch' | 'couple' | 'walk' | 'hop' | 'joint' | 'sling' | 'split' | 'done'

const OBJ: Record<Step, string> = {
  move: 'Camina hasta el borde de la pasarela (WASD / stick izquierdo). Mira con el ratón.',
  jump: 'Salta el hueco ({jump}). Si caes, la red te devuelve.',
  high: 'Mantén el salto para llegar más alto y sube al escalón.',
  box: 'Coge la caja ({grab}), déjala sobre el botón y cruza la puerta.',
  punch: 'Pega al botón rojo ({punch}) para abrir la reja. Lo que brilla en rojo se golpea.',
  swing: 'Mira al anillo: cuando brille en violeta, mantén {context}. Te engancha y te recoge; balancéate y suelta al final del arco.',
  spring: 'Mantén {context} en el anillo del muro: al recogerlo del todo se carga el muelle… ¡suelta y sal disparado!',
  meet: 'Ámbar-bot está dormido: despiértalo con un toque ({punch}).',
  boost: 'Salta sobre la cabeza de Ámbar: rebotarás como en un trampolín hasta lo alto del muro.',
  hand: 'Arriba, ponte en el borde mirando a Ámbar y mantén {grab} para ofrecerle la mano.',
  cross: 'Ámbar cruza primero y te ofrece la mano…',
  catch: 'Salta hacia Ámbar y agarra su mano en el aire ({grab}). También puedes engancharla con {context} cuando brille.',
  couple: 'Subid juntos a la placa y mantened {context} para acoplaros.',
  walk: 'Unidos: tu stick mueve tu pierna izquierda. Ámbar te sigue el paso. Caminad hasta el primer hueco.',
  hop: 'Pulsa {jump} tú solo: un bote unilateral basta para este hueco pequeño.',
  joint: 'Ahora Ámbar saltará contigo: pulsad {jump} a la vez para el salto conjunto.',
  sling: 'Mantened {context} con los dos brazos en los anillos hasta tensar al máximo… y soltad a la vez.',
  split: 'Mantened {context} sobre suelo ancho, sin anillos a la vista, para separaros.',
  done: '¡Taller completado!',
}

export function Tutorial() {
  const st = useRef({ step: 'move' as Step, t: 0, t2: 0, said: new Set<string>() })

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
        if (p.z < -33 && me.grounded) { reachCheckpoint('t3'); go('punch') }
        break
      case 'punch':
        if (G.vars['pb:t_gate']) {
          once('punchok', () => say.toast('¡Bien! Con {punch} también empujas a tu compañero o golpeas enemigos.', 'good'))
          go('swing')
        }
        break
      case 'swing':
        if (me.cable.state === 'attached') once('reelhint', () => say.toast('Balancéate con el stick y suelta el gancho al final del arco (o salta con {jump}).', 'info'))
        if (p.z < -45 && me.grounded && feet > 0.5) { reachCheckpoint('t4'); go('spring'); G.medals.add('tutorial') }
        break
      case 'spring':
        if (feet > 4.5 && me.grounded) {
          reachCheckpoint('t5')
          say.toast('Truco: en el aire contra un muro, mantén {grab} para agarrarte a él; salta para impulsarte.', 'info', 4200)
          go('meet')
        }
        break
      case 'meet':
        // Wake it with a punch (or just stand next to it for a while).
        if (p.distanceTo(bot.pos) < 4.5) s.t2 += dt
        if ((bot.protectT > 0 && p.distanceTo(bot.pos) < 4) || s.t2 > 7) {
          brain.setMode({ k: 'base', at: V(1.0, 5, -67.4) })
          say.sub('Ámbar-bot', '¡Bip-bip! (¡Hola, Cian! ¿Me ayudas a subir?)', '#ffd27a')
          bot.emote = 1
          bot.emoteT = G.time
          fx('sfx', { n: 'beepAmber', p: bot.pos })
          useHud.getState().set({ roomTitle: null })
          say.room('5', 'Ámbar-bot', 'Cooperación')
          say.toast('Junto a Ámbar, mantén {grab} para agarrarlo y llevarlo a rastras.', 'info', 3600)
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
      <Sign pos={[-2.2, 3, -30.6]} text="Caja aquí" sub="coge la caja" small />
      <Gate pos={[0, 1, -31.7]} size={[7.6, 2.8, 0.5]} openVar="sw:t_box" />

      {/* T4 punch button gate, then the swing */}
      <Block pos={[0, 1, -36]} size={[8, 9, 8]} />
      <PunchButton id="t_gate" pos={[-2.9, 1, -36.2]} rotY={Math.PI / 2} label="¡Pégale!" />
      <Gate pos={[0, 1, -38.4]} size={[7.6, 2.8, 0.5]} openVar="pb:t_gate" color="#ff5b4a" />
      <Ring id="t_swing" pos={[0, 4.4, -42.2]} mount="hang" big={false} />
      <SafetyNet pos={[0, -1, -42]} size={[8, 4]} returnTo={[0, 1, -38]} />
      <Sign pos={[3.2, 3.2, -39.2]} rotY={-0.4} text="Acción" sub="mantén cuando brille" small />
      <Block pos={[0, 1, -49.75]} size={[8, 9, 11.5]} />

      {/* T5 spring launch up the cliff */}
      <Block pos={[0, 5, -62]} size={[12, 13, 13]} />
      <Ring id="t_wall" pos={[0, 4.3, -55.15]} mount="wall" big={false} facing={0} />
      <Sign pos={[-3, 3.4, -52]} rotY={0.4} text="Muelle" sub="mantén, carga y suelta" small />
      <Tree pos={[-4.5, 5, -64]} />
      <Beacon pos={[4.5, 5, -58]} id="t5" />

      {/* T6 springboard wall + hand */}
      <Block pos={[0, 7.4, -75]} size={[10, 15, 13]} />
      <Sign pos={[-3.2, 7.2, -66.8]} text="Trampolín" sub="salta sobre su cabeza" small />
      <Banner pos={[4.6, 10.4, -69]} rotY={0} />

      {/* T7 reverse: bot crosses, you catch its hand */}
      <Ring id="t_cross" pos={[2.5, 11.2, -83.3]} mount="hang" big={false} />
      <SafetyNet pos={[0, 4.8, -83.3]} size={[10, 3.6]} returnTo={[0, 7.4, -79.5]} />
      <Block pos={[0, 7.4, -91]} size={[10, 15, 12]} />
      <CouplePlate id="t_plate" pos={[0, 7.42, -91.5]} yaw={Math.PI} />
      <Sign pos={[4, 9.6, -90]} rotY={-0.5} text="Placa de unión" sub="mantened Acción juntos" small />

      {/* T8 joined: hop gap (1.2 m), joint gap (3 m) */}
      <Block pos={[0, 7.4, -101.2]} size={[7, 14, 6]} />
      <Block pos={[0, 7.4, -110.2]} size={[7, 14, 6]} />
      <Sign pos={[4.2, 9.6, -99.5]} rotY={-0.6} text="Bote" sub="un solo impulso" small />
      <Sign pos={[4.2, 9.6, -108.5]} rotY={-0.6} text="Conjunto" sub="saltad a la vez" small />

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
