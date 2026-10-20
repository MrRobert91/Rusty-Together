import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { G, fx, isHost, onFx } from '../runtime'
import { hostSet, onVar } from '../net/replication'
import { banner, roomTitle, subtitle, toast, useHud } from '../hud'
import { setMusic, type MusicMood } from '../../core/audio'
import { BIG } from '../tuning'

/** Register a function that runs every physics step on the host only. */
export function useHostLogic(fn: (dt: number) => void) {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    const f = (dt: number) => ref.current(dt)
    G.hostLogic.push(f)
    return () => { G.hostLogic = G.hostLogic.filter((x) => x !== f) }
  }, [])
}

/** Host-authored presentation, mirrored to the guest. */
export const say = {
  objective: (text: string) => hostSet('obj', text),
  mood: (m: MusicMood) => hostSet('mood', m),
  room: (n: string, title: string, mode: string) => fx('room', { n, title, mode }),
  banner: (title: string, sub?: string, color?: string) => fx('banner', { title, sub, color }),
  toast: (text: string, tone: 'info' | 'good' | 'warn' | 'cyan' | 'amber' = 'info') => fx('toast', { text, tone }),
  sub: (who: string, text: string, color = '#ffd27a') => fx('subtitle', { who, text, color }),
}

/** Wires presentation vars/events into the HUD on both peers. */
export function PresentationBridge() {
  useEffect(() => {
    const offs = [
      onVar('obj', (t: string) => useHud.setState({ objective: t })),
      onVar('mood', (m: MusicMood) => setMusic(m)),
    ]
    const subs = [
      onFx('room', (e) => roomTitle(e.n, e.title, e.mode)),
      onFx('banner', (e) => banner(e.title, e.sub, e.color)),
      onFx('toast', (e) => toast(e.text, e.tone)),
      onFx('subtitle', (e) => subtitle(e.who, e.text, e.color)),
      onFx('medal', (e) => toast(`Medalla: ${MEDALS[e.id] ?? e.id}`, 'good', 3500)),
    ]
    return () => { offs.forEach((o) => o()); subs.forEach((o) => o()) }
  }, [])
  return null
}

const MEDALS: Record<string, string> = {
  rescue: 'os habéis rescatado en ambos sentidos 🤝',
  chain: 'tres anillos sin caer 🔗',
  box: 'caja compartida 📦',
  bells: 'carrera de muelles 🔔',
  crab: 'cangrejo desactivado 🦀',
}


/** Host: mark the joined body's respawn spot when it stands on a safe platform. */
export function useJoinedSafeZones(zones: Array<{ c: [number, number, number]; half: [number, number]; respawn: [number, number, number]; yaw: number }>) {
  useHostLogic(() => {
    const B = G.big
    if (!B.active || !B.grounded || B.dead || !G.checkpoint) return
    for (const z of zones) {
      if (Math.abs(B.pos.x - z.c[0]) < z.half[0] && Math.abs(B.pos.z - z.c[2]) < z.half[1] && Math.abs(B.pos.y - BIG.feet - z.c[1]) < 1) {
        const j = G.checkpoint.joined
        if (!j || j.pos.x !== z.respawn[0] || j.pos.z !== z.respawn[2]) G.checkpoint.joined = { pos: new THREE.Vector3(...z.respawn), yaw: z.yaw }
      }
    }
  })
}

export const hostOnly = () => isHost()
