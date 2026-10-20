import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { Block, Banner, Pillar, Scaffold, Tree, HazardStrip } from '../../env/blocks'
import { Beacon, Conveyor, CouplePlate, Crate, Gate, Ring, SafetyNet, Sign, Switch, Zone } from '../../env/interactive'
import { CraneBeam, Glass, GoldenNut, Seesaw, Wall } from '../../env/props2'
import { defineCheckpoints, reachCheckpoint } from '../checkpoints'
import { PresentationBridge, say, useHostLogic, useJoinedSafeZones } from '../common'
import { G, fx, onFx } from '../../runtime'
import { hostSet } from '../../net/replication'
import { camHints } from '../../CameraRig'
import { backdropCfg } from '../../env/Atmosphere'
import { Arena } from './Arena'
import { CrabRoom } from './Crab'
import { MINI } from '../../tuning'

/*
 * Nivel 1 · Muelles de rebote (GDD). Six rooms along -Z:
 *  1 Escuela de guantes [S]  springboard + offered hand, ring over a gap
 *  2 Cintas cruzadas   [S]  conveyor lanes, cross-opening stoppers, one temptation
 *  3 Carrera de muelles [C] optional 1-minute arena (side platform)
 *  4 Primer cuerpo     [J]  couple, walk, unilateral hop, joint jumps
 *  5 Pasamanos de grúas [J] seesaw, monkey-bar rings, 6 m slingshot
 *  6 Cangrejo clasificador [M] climax with both forms
 */

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

export function setupLevel1() {
  backdropCfg.cx = 6
  backdropCfg.cz = -95
  backdropCfg.inner = 110
  defineCheckpoints([
    { id: 'c1', room: 1, a: [-1.5, 1, -1], b: [1.5, 1, -1], yaw: Math.PI, killY: -12 },
    { id: 'c1b', room: 1, a: [-1.5, 3.4, -19], b: [1.5, 3.4, -19], yaw: Math.PI, killY: -12 },
    { id: 'c1c', room: 1, a: [-1.5, 3.4, -31], b: [1.5, 3.4, -31], yaw: Math.PI, killY: -12 },
    { id: 'c2', room: 2, a: [-1.5, 3.4, -55], b: [1.5, 3.4, -55], yaw: Math.PI, killY: -14 },
    { id: 'c4', room: 4, a: [-1.5, 3.4, -71], b: [1.5, 3.4, -71], yaw: Math.PI, joined: [0, 2.4, -76], killY: -14 },
    { id: 'c5', room: 5, a: [-1.5, 4.4, -118], b: [1.5, 4.4, -118], yaw: Math.PI, joined: [0, 3.4, -118], killY: -16 },
    { id: 'c5b', room: 5, a: [-1.2, 4.4, -156], b: [1.2, 4.4, -156], yaw: Math.PI, joined: [0, 3.4, -156], killY: -16 },
    { id: 'c6', room: 6, a: [-1.5, 4.4, -168], b: [1.5, 4.4, -168], yaw: Math.PI, joined: [0, 3.4, -168], killY: -16 },
    { id: 'c6b', room: 6, a: [-1.5, 4.4, -170], b: [1.5, 4.4, -170], yaw: Math.PI, joined: [0, 3.4, -174], killY: -16 },
    { id: 'c6c', room: 6, a: [-1.5, 4.4, -172], b: [1.5, 4.4, -172], yaw: Math.PI, joined: [0, 3.4, -176], killY: -16 },
  ])
  // Guided shared camera for the joined sections.
  camHints.fn = (p) => {
    if (p.z < -127 && p.z > -162) return { yaw: 0.5, pitch: 0.3, dist: 13 } // cranes: three-quarter view of the swings
    if (p.z <= -162) return { yaw: 0, pitch: 0.48, dist: 13.5 } // crab arena
    return { yaw: 0, pitch: 0.36, dist: 10.5 }
  }
}

/* ======================================================================== */

export function Level1() {
  useEffect(() => {
    say.room('1', 'Escuela de guantes', 'Separados')
    say.objective('Subid al muro: uno se agacha ({brake}) para hacer de trampolín y el de arriba ofrece la mano ({grab}).')
    say.mood('explore')
  }, [])
  return (
    <>
      <PresentationBridge />
      <Room1 />
      <Room2 />
      <Arena />
      <Room4 />
      <Room5 />
      <CrabArenaGeometry />
      <CrabRoom />
      <Story />
    </>
  )
}

/* ------------------------------------------------------------------------ */
/* Room 1 — Escuela de guantes                                               */
/* ------------------------------------------------------------------------ */

function Room1() {
  return (
    <>
      {/* A: start yard */}
      <Block pos={[0, 0, -5]} size={[12, 8, 14]} />
      <Tree pos={[4.6, 0, 0.5]} s={1.1} />
      <Tree pos={[-4.8, 0, 1]} s={0.8} />
      <Scaffold pos={[7.5, -8, -2]} h={16} />
      <Banner pos={[5.8, 3.3, -9]} rotY={-Math.PI / 2} />
      <Sign pos={[5.2, 2.2, -6.5]} rotY={-0.9} text="Escuela de guantes" sub="Sala 1 · separados" />
      {/* Practice swing pit (optional): ring over a net */}
      <Block pos={[-13, 0, -5]} size={[5, 8, 7]} />
      <Ring id="r1_practice" pos={[-8.3, 3.7, -5]} mount="hang" big={false} />
      <SafetyNet pos={[-8.25, -1.6, -5]} size={[4.5, 7]} returnTo={[-4.5, 0, -5]} />
      <Sign pos={[-5.2, 2.2, -8.6]} rotY={0.6} text="Práctica" sub="mantén el gancho · suelta" small />
      <GoldenNut id="n1" pos={[-13.5, 1.2, -5]} />

      {/* B: the wall (2.4 m) — springboard + offered hand */}
      <Block pos={[0, 2.4, -17]} size={[10, 10.4, 10]} />
      <HazardStrip pos={[0, 0.03, -11.6]} size={[10, 0.6]} />
      <Sign pos={[-3.8, 1.8, -10.6]} rotY={0.2} text="¿Muy alto?" sub="agáchate (B): trampolín" small />
      <Sign pos={[3.8, 4.2, -12.6]} rotY={-0.2} text="Desde arriba" sub="en el borde: ofrece la mano" small />

      {/* Gap with a high ring: only reachable from a partner's springboard */}
      <Ring id="r1_gap" pos={[0, 7.3, -23.8]} mount="hang" big={false} />
      <SafetyNet pos={[0, 0.4, -23.8]} size={[10, 3.6]} returnTo={[0, 2.4, -20]} />
      <Block pos={[0, 2.4, -30.6]} size={[10, 10.4, 10]} />
      <Sign pos={[3.6, 4.4, -21]} rotY={-0.5} text="El guante" sub="el primero ayuda al segundo" small />
      <Beacon pos={[4.3, 2.4, -32]} id="c1c" />
      <GoldenNut id="n2" pos={[0, 8.6, -23.8]} />
    </>
  )
}

/* ------------------------------------------------------------------------ */
/* Room 2 — Cintas cruzadas                                                   */
/* ------------------------------------------------------------------------ */

function Room2() {
  return (
    <>
      {/* Lane base */}
      <Block pos={[0, 2.4, -42.8]} size={[11.6, 10.4, 14.4]} grass={false} kind="metal" noCollide />
      {/* Two conveyors flowing back toward the start */}
      <Conveyor pos={[-3, 2.4, -41.5]} size={[3.6, 11]} dir={[0, 1]} speed={2.2} speedVar="cvL" />
      <Conveyor pos={[3, 2.4, -41.5]} size={[3.6, 11]} dir={[0, 1]} speed={2.2} speedVar="cvR" />
      {/* Static floor at both ends so boxes rest on their sockets */}
      <Block pos={[0, 2.4, -35.8]} size={[11.6, 0.6, 0.6]} kind="plate" grass={false} trim={false} />
      <Block pos={[0, 2.4, -48.5]} size={[11.6, 0.6, 3]} kind="plate" grass={false} trim={false} />
      {/* Divider with three windows so you can see (and signal) each other */}
      {[-36.6, -41.4, -46.2].map((z, i) => <Wall key={i} pos={[0, 2.4, z]} size={[2.4, 1.9, 2.2]} kind="metal" />)}
      {[-39, -43.8, -48.6].map((z, i) => <Glass key={i} pos={[0, 2.4, z]} size={[1.2, 1.9, 2.6]} />)}
      <Wall pos={[-5.6, 2.4, -42.8]} size={[0.4, 1.9, 14.4]} />
      <Wall pos={[5.6, 2.4, -42.8]} size={[0.4, 1.9, 14.4]} />
      <Sign pos={[0, 5.1, -36.4]} text="Cintas cruzadas" sub="cada uno abre el paso del otro" small post={false} />

      {/* Your-name boxes */}
      <Crate id="boxL" pos={[-3, 3.4, -31.5]} label="CIAN" labelColor="#139aa8" />
      <Crate id="boxR" pos={[3, 3.4, -31.5]} label="ÁMBAR" labelColor="#d9670b" />

      {/* Stoppers (barriers) and the switches that open the OTHER lane */}
      <Gate pos={[-3, 2.4, -42]} size={[3.6, 1.8, 0.4]} openVar="barL" color="#22c7d6" />
      <Gate pos={[3, 2.4, -42]} size={[3.6, 1.8, 0.4]} openVar="barR" color="#ff9a1f" />
      <Switch id="r2_openL" pos={[3, 2.42, -39.2]} radius={0.75} color="#22c7d6" />
      <Switch id="r2_openR" pos={[-3, 2.42, -45.3]} radius={0.75} color="#ff9a1f" />
      <Sign pos={[4.6, 4.2, -38.6]} rotY={-Math.PI / 2} text="Tope" sub="abre la otra cinta" small post={false} />
      <Sign pos={[-4.6, 4.2, -45.6]} rotY={Math.PI / 2} text="Tope" sub="abre la otra cinta" small post={false} />

      {/* The single fast charge: helps your lane, speeds up theirs (5 s) */}
      <TurboPad side="L" pos={[-1.6, 2.42, -44.8]} />
      <TurboPad side="R" pos={[1.6, 2.42, -44.8]} />

      {/* Box sockets → lane doors */}
      <Switch id="sockL" pos={[-3, 2.42, -48.6]} radius={1.15} crates robots={false} color="#22c7d6" />
      <Switch id="sockR" pos={[3, 2.42, -48.6]} radius={1.15} crates robots={false} color="#ff9a1f" />
      <Gate pos={[-3, 2.4, -50.2]} size={[3.6, 2.6, 0.4]} openVar="sw:sockL" color="#22c7d6" />
      <Gate pos={[3, 2.4, -50.2]} size={[3.6, 2.6, 0.4]} openVar="sw:sockR" color="#ff9a1f" />
      <GoldenNut id="n3" pos={[0, 5.6, -41.4]} />

      {/* D: landing after the lanes */}
      <Block pos={[0, 2.4, -58.5]} size={[16, 10.4, 16]} />
      <Tree pos={[-6, 2.4, -63]} />
      <Scaffold pos={[-9.5, -8, -56]} h={20} />
      <Beacon pos={[-4.5, 2.4, -53]} id="c2" />
    </>
  )
}

function TurboPad({ side, pos }: { side: 'L' | 'R'; pos: [number, number, number] }) {
  // The single fast charge only works after the first relay (GDD).
  useHostLogic(() => {
    if (!G.vars.relay1 || G.vars.turboUsed || !G.vars[`sw:turbo${side}`]) return
    hostSet('turboUsed', side)
    hostSet('turboT', G.time)
    // Your lane runs backwards (helps), theirs runs fast against them.
    hostSet(side === 'L' ? 'cvL' : 'cvR', -0.9)
    hostSet(side === 'L' ? 'cvR' : 'cvL', 1.6)
    fx('sfx', { n: 'charge', p: V(...pos) })
    say.toast(side === 'L' ? '¡Carga rápida en la cinta de Cian! La de Ámbar acelera 5 s.' : '¡Carga rápida en la cinta de Ámbar! La de Cian acelera 5 s.', side === 'L' ? 'cyan' : 'amber')
  })
  return (
    <>
      <Switch id={`turbo${side}`} pos={pos} radius={0.55} color="#ffd23a" />
      <Sign pos={[pos[0] * 1.25, pos[1] + 1.4, pos[2]]} rotY={side === 'L' ? Math.PI / 2 : -Math.PI / 2} text="Carga rápida" sub="ventaja 5 s" small post={false} bg="#5a2d10" />
    </>
  )
}

/* ------------------------------------------------------------------------ */
/* Room 4 — Primer cuerpo                                                     */
/* ------------------------------------------------------------------------ */

function Room4() {
  return (
    <>
      {/* E: coupling yard */}
      <Block pos={[0, 2.4, -74]} size={[14, 10.4, 16]} />
      <CouplePlate id="r4plate" pos={[0, 2.42, -74]} yaw={Math.PI} />
      <Sign pos={[4.8, 4.6, -71]} rotY={-0.4} text="Primer cuerpo" sub="mantened Y juntos" />
      <Tree pos={[-5.5, 2.4, -79]} s={1.2} />
      <Banner pos={[6.8, 5.6, -79]} rotY={-Math.PI / 2} />
      {/* F: walkway to learn walking with two legs */}
      <Block pos={[0, 2.4, -87]} size={[6, 10.4, 10]} />
      <Sign pos={[3.6, 4.4, -84]} rotY={-0.6} text="Unidos" sub="la dirección es la media" small />
      {/* Three 5 m platforms: hop (1.2 m), joint (3 m), joint + step */}
      <Block pos={[0, 2.4, -95.7]} size={[5, 10, 5]} />
      <Block pos={[0, 2.4, -103.7]} size={[5, 10, 5]} />
      <Block pos={[0, 3.4, -111.7]} size={[5, 11, 5]} />
      <Sign pos={[3.4, 4.6, -93.4]} rotY={-0.6} text="Bote" sub="uno solo basta" small />
      <Sign pos={[3.4, 4.6, -101.4]} rotY={-0.6} text="A la vez" sub="salto conjunto" small />
      <Pillar pos={[-6, -2, -100]} radius={2} height={30} collide={false} />
      <GoldenNut id="n4" pos={[3.2, 4.2, -107.5]} />
    </>
  )
}

/* ------------------------------------------------------------------------ */
/* Room 5 — Pasamanos de grúas                                                */
/* ------------------------------------------------------------------------ */

function Room5() {
  return (
    <>
      {/* G: crane yard */}
      <Block pos={[0, 3.4, -120.1]} size={[10, 11, 11.8]} />
      <Sign pos={[-4, 5.6, -116]} rotY={0.5} text="Pasamanos de grúas" sub="un brazo sujeta, el otro avanza" />
      <Scaffold pos={[5.5, 3.4, -121]} w={3} d={3} h={9} />
      {/* Seesaw over the void, with rings above both ends */}
      <Seesaw id="seesaw" pos={[0, 3.2, -131.4]} size={[3.5, 0.4, 10]} />
      <Ring id="r5_s1" pos={[-1.6, 9.2, -127.5]} mount="hang" mini={false} />
      <Ring id="r5_s2" pos={[1.6, 9.2, -134.5]} mount="hang" mini={false} />
      <CraneBeam from={[0, -124]} to={[0, -152]} y={11.3} />
      {/* Monkey-bar rings, alternating sides */}
      <Ring id="r5_m1" pos={[-1.6, 8.6, -139.5]} mount="hang" mini={false} />
      <Ring id="r5_m2" pos={[1.6, 8.6, -144.5]} mount="hang" mini={false} />
      <Ring id="r5_m3" pos={[-1.6, 8.6, -149.5]} mount="hang" mini={false} />
      <GoldenNut id="n5" pos={[0, 5.4, -144.5]} />
      {/* R: rest before the launch */}
      <Block pos={[0, 3.4, -156]} size={[6, 11, 6]} />
      <Beacon pos={[2.4, 3.4, -154]} id="c5b" />
      {/* Slingshot frame: two rings, double confirmation, 6 m to the crab arena */}
      <Ring id="r5_slW" pos={[-1.9, 8.4, -159.6]} mount="hang" mini={false} sling={{ group: 'r5', to: V(0, 3.4, -170), time: 1.35 }} />
      <Ring id="r5_slE" pos={[1.9, 8.4, -159.6]} mount="hang" mini={false} sling={{ group: 'r5', to: V(0, 3.4, -170), time: 1.35 }} />
      <Scaffold pos={[0, 3.4, -159.6]} w={5.4} d={0.8} h={6.2} />
      <Sign pos={[2.6, 5.6, -153.4]} rotY={-0.5} text="Tirachinas" sub="tensad y soltad a la vez" small />
    </>
  )
}

/* ------------------------------------------------------------------------ */
/* Room 6 geometry (crab logic lives in Crab.tsx)                             */
/* ------------------------------------------------------------------------ */

function CrabArenaGeometry() {
  return (
    <>
      <Block pos={[0, 3.4, -177]} size={[28, 11, 24]} />
      {/* Socket dais (needs a joint jump while carrying) */}
      <Block pos={[-7, 4.8, -185.5]} size={[5, 1.4, 4.5]} kind="metal" grass={false} />
      <Scaffold pos={[-13, 3.4, -188]} w={2.5} d={2.5} h={12} />
      <Scaffold pos={[13, 3.4, -188]} w={2.5} d={2.5} h={12} />
      <Banner pos={[-6, 11, -189.2]} />
      <Banner pos={[6, 11, -189.2]} />
      <Sign pos={[-7, 7.8, -188]} text="Toma del fusible" small post={false} />
      {/* Elevator to the garden (lights up at the end) */}
      <ElevatorDecor />
    </>
  )
}

function ElevatorDecor() {
  return (
    <group position={[0, 3.4, -192]}>
      <Pillar pos={[-3, 18, 0]} radius={0.6} height={22} collide={false} />
      <Pillar pos={[3, 18, 0]} radius={0.6} height={22} collide={false} />
      <mesh position-y={14} castShadow><boxGeometry args={[7, 0.6, 2]} /><meshStandardMaterial color="#f2b51d" /></mesh>
    </group>
  )
}

/* ------------------------------------------------------------------------ */
/* Host script for rooms 1–5                                                  */
/* ------------------------------------------------------------------------ */

function Story() {
  const st = useRef({ room: 1, barLUntil: 0, barRUntil: 0, said: new Set<string>(), turboEnd: 0, ringChain: 0, lastRing: '' })

  useJoinedSafeZones([
    { c: [0, 2.4, -74], half: [7, 8], respawn: [0, 2.4, -76], yaw: Math.PI },
    { c: [0, 2.4, -87], half: [3, 5], respawn: [0, 2.4, -88], yaw: Math.PI },
    { c: [0, 2.4, -95.7], half: [2.5, 2.5], respawn: [0, 2.4, -95.7], yaw: Math.PI },
    { c: [0, 2.4, -103.7], half: [2.5, 2.5], respawn: [0, 2.4, -103.7], yaw: Math.PI },
    { c: [0, 3.4, -111.7], half: [2.5, 2.5], respawn: [0, 3.4, -111.7], yaw: Math.PI },
    { c: [0, 3.4, -120.1], half: [5, 5.9], respawn: [0, 3.4, -121], yaw: Math.PI },
    { c: [0, 3.4, -156], half: [3, 3], respawn: [0, 3.4, -155.5], yaw: Math.PI },
    { c: [0, 3.4, -172], half: [14, 7], respawn: [0, 3.4, -170], yaw: Math.PI },
  ])

  // Ring-chain medal: three rings in a row without touching the ground.
  useEffect(() => onFx('ringHit', () => {
    if (!G.session?.isHost) return
    const s = st.current
    s.ringChain = G.big.grounded ? 1 : s.ringChain + 1
    if (s.ringChain >= 3 && !G.medals.has('chain')) { G.medals.add('chain'); fx('medal', { id: 'chain' }) }
  }), [])

  useHostLogic(() => {
    const s = st.current
    const once = (k: string, f: () => void) => { if (!s.said.has(k)) { s.said.add(k); f() } }
    const [a, b] = G.minis
    const lead = Math.min(a.hidden ? 0 : a.pos.z, b.hidden ? 0 : b.pos.z, G.big.active ? G.big.pos.z : 0)
    const both = (zMax: number, yMin: number) => !a.hidden && !b.hidden && a.pos.z < zMax && b.pos.z < zMax && a.pos.y - MINI.feet > yMin && b.pos.y - MINI.feet > yMin

    /* Room 1 */
    if (both(-12.2, 2.0)) {
      reachCheckpoint('c1b')
      once('r1b', () => say.objective('Cruzad el hueco: el anillo alto solo se alcanza desde el trampolín del compañero. El primero ofrece la mano al segundo.'))
    }
    if (both(-25.8, 2.0)) {
      reachCheckpoint('c1c')
      once('r1c', () => { say.banner('¡Sala superada!', 'Os habéis ayudado en ambos sentidos', '#5dff8a'); say.objective('Seguid adelante hacia las cintas.') })
    }

    /* Room 2 */
    if (lead < -35.6) once('r2', () => {
      say.room('2', 'Cintas cruzadas', 'Separados')
      say.objective('Cada uno coge su caja. El tope de una cinta abre la barrera de la otra: id por carriles distintos.')
    })
    const now = G.time
    if (G.vars['sw:r2_openL']) s.barLUntil = now + 6
    if (G.vars['sw:r2_openR']) s.barRUntil = now + 6
    const barL = now < s.barLUntil ? 1 : 0
    const barR = now < s.barRUntil ? 1 : 0
    if (barL !== (G.vars.barL ?? 0)) hostSet('barL', barL)
    if (barR !== (G.vars.barR ?? 0)) hostSet('barR', barR)
    if (barL && !G.vars.relay1) {
      hostSet('relay1', 1)
      say.toast('¡Relevo! Ahora el que ha pasado abre la barrera del otro (tope tras su barrera).', 'good')
    }
    if (G.vars.turboUsed && G.vars.turboT && now - G.vars.turboT > 5 && (G.vars.cvL !== 1 || G.vars.cvR !== 1)) {
      hostSet('cvL', 1)
      hostSet('cvR', 1)
      say.toast('Las cintas vuelven a su velocidad normal.', 'info')
    }
    if (G.vars['sw:sockL'] && G.vars['sw:sockR']) once('r2done', () => {
      reachCheckpoint('c2')
      say.banner('¡Puertas abiertas!', undefined, '#5dff8a')
      say.objective('Delante: la placa de unión. A la derecha: la Carrera de muelles opcional (subid los dos a las plataformas).')
    })

    /* Room 4 */
    if (lead < -67) once('r4', () => {
      say.room('4', 'Primer cuerpo', 'Unidos')
      reachCheckpoint('c4')
      say.objective('Subid a la placa y mantened {couple} los dos para acoplaros.')
    })
    if (G.form === 'joined' && G.big.pos.z > -90) once('r4walk', () => say.objective('Cada uno mueve su pierna. Un salto unilateral ({jump}) basta para el primer hueco; para los siguientes, {jump} a la vez.'))

    /* Room 5 */
    if (G.form === 'joined' && G.big.pos.z < -114.5 && G.big.grounded) once('r5', () => {
      reachCheckpoint('c5')
      say.room('5', 'Pasamanos de grúas', 'Unidos')
      say.mood('tension')
      say.objective('Cruzad el balancín y avanzad de anillo en anillo: un brazo sujeta mientras el otro se lanza (mantened {primary} cada uno).')
    })
    if (G.form === 'joined' && G.big.pos.z < -153.2 && G.big.grounded && G.big.pos.y > 3) once('r5b', () => {
      reachCheckpoint('c5b')
      say.objective('Tirachinas: mantened el gancho ({primary}) en los dos anillos hasta tensar al máximo y soltad a la vez.')
    })
    if (G.form === 'split' && lead < -114) once('r5split', () => say.toast('Los pasamanos necesitan brazos de 8 m: volved a uniros en la placa.', 'warn'))
  })

  return (
    <>
      <Zone pos={[0, 2.4, -74]} half={[7, 1.5, 8]} onEnter={() => { if (G.form === 'split') reachCheckpoint('c4') }} />
    </>
  )
}

