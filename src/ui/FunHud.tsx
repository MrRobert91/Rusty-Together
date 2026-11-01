import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { G, onFx } from '../game/runtime'
import { cameraRef } from '../game/CameraRig'
import { COMBO_WINDOW, SPARKS, multOf, type SparkKind } from '../game/fun/sync'
import { useHud } from '../game/hud'
import { sfx } from '../core/audio'
import { settings } from '../core/settings'

/* ------------------------------------------------------------------ */
/* Comic words that pop out of the world (¡BOING!, ¡CHOCA!, +120 …)    */
/* ------------------------------------------------------------------ */

interface Pop { el: HTMLDivElement; p: THREE.Vector3; t0: number; life: number; big: boolean; drift: number }

const MAX_POPS = 14

export function Popups() {
  const layer = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const pops: Pop[] = []
    const v = new THREE.Vector3()
    const add = (text: string, sub: string | null, p: number[] | { x: number; y: number; z: number }, color: string, big: boolean) => {
      const host = layer.current
      if (!host) return
      if (pops.length >= MAX_POPS) { const o = pops.shift()!; o.el.remove() }
      const el = document.createElement('div')
      el.className = `pop ${big ? 'big' : ''}`
      el.style.setProperty('--pc', color)
      el.style.setProperty('--rot', `${(Math.random() - 0.5) * 16}deg`)
      el.innerHTML = `<span class="pop-word"></span>${sub ? '<span class="pop-pts"></span>' : ''}`
      ;(el.firstChild as HTMLElement).textContent = text
      if (sub) (el.lastChild as HTMLElement).textContent = sub
      host.appendChild(el)
      const pos = Array.isArray(p) ? new THREE.Vector3(p[0], p[1], p[2]) : new THREE.Vector3(p.x, p.y, p.z)
      pos.y += 1.2
      pops.push({ el, p: pos, t0: performance.now(), life: big ? 1500 : 1100, big, drift: (Math.random() - 0.5) * 0.8 })
    }
    const offs = [
      onFx('spark', (e: { k: SparkKind; p: number[]; pts: number; mult: number; extra?: string }) => {
        const d = SPARKS[e.k]
        if (!d) return
        add(e.extra ?? d.word, `+${e.pts}${e.mult > 1 ? `  ×${e.mult}` : ''}`, e.p, d.color, !!d.big || e.mult >= 4)
        // A rising chime: the longer the chain, the higher it climbs.
        sfx('combo', undefined, 0.8, Math.pow(1.122, Math.min(e.mult, 5) - 1))
      }),
      onFx('pop', (e: { text: string; p: number[]; c?: string; big?: boolean }) => add(e.text, null, e.p, e.c ?? '#ffffff', !!e.big)),
    ]
    let raf = 0
    const loop = () => {
      const cam = cameraRef.current
      const now = performance.now()
      for (let i = pops.length - 1; i >= 0; i--) {
        const o = pops[i]
        const k = (now - o.t0) / o.life
        if (k >= 1 || !cam) { o.el.remove(); pops.splice(i, 1); continue }
        v.copy(o.p)
        v.y += k * 1.4
        v.x += o.drift * k
        v.project(cam)
        if (v.z > 1) { o.el.style.display = 'none'; continue }
        o.el.style.display = ''
        // Overshoot pop-in, hold, then shrink away.
        const s = k < 0.12 ? 0.3 + (k / 0.12) * 1.0 : k < 0.22 ? 1.3 - ((k - 0.12) / 0.1) * 0.3 : k > 0.8 ? 1 - (k - 0.8) * 3 : 1
        o.el.style.transform = `translate(-50%, -50%) translate(${(v.x * 0.5 + 0.5) * innerWidth}px, ${(-v.y * 0.5 + 0.5) * innerHeight}px) rotate(var(--rot)) scale(${s})`
        o.el.style.opacity = String(k > 0.85 ? (1 - k) / 0.15 : 1)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => { cancelAnimationFrame(raf); offs.forEach((o) => o()); pops.forEach((o) => o.el.remove()) }
  }, [])
  return <div ref={layer} className="pops" />
}

/* ------------------------------------------------------------------ */
/* Shared Sincronía meter (score, multiplier, chain timer, nuts)       */
/* ------------------------------------------------------------------ */

export function SyncMeter() {
  const arena = useHud((s) => s.arena)
  const root = useRef<HTMLDivElement>(null)
  const score = useRef<HTMLDivElement>(null)
  const mult = useRef<HTMLDivElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  const nuts = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let raf = 0
    let shown = 0
    let lastScore = 0
    let lastMult = 1
    const loop = () => {
      const sync = (G.vars.sync as number[] | undefined) ?? [0, 0, 0]
      const [sc, combo, until] = sync
      // Rolling counter.
      shown += (sc - shown) * 0.18
      if (Math.abs(sc - shown) < 1) shown = sc
      if (score.current) score.current.textContent = Math.round(shown).toLocaleString('es-ES')
      const live = G.time < until
      const m = live ? multOf(combo) : 1
      if (mult.current) {
        mult.current.textContent = `×${m}`
        mult.current.dataset.m = String(m)
        if (m !== lastMult && m > 1) { mult.current.classList.remove('bump'); void mult.current.offsetWidth; mult.current.classList.add('bump') }
      }
      lastMult = m
      if (bar.current) bar.current.style.width = `${live ? Math.max(0, (until - G.time) / COMBO_WINDOW) * 100 : 0}%`
      if (root.current && sc !== lastScore) { root.current.classList.remove('hit'); void root.current.offsetWidth; root.current.classList.add('hit') }
      lastScore = sc
      if (nuts.current) {
        const total = (G.vars.nutsTotal as number | undefined) ?? 0
        nuts.current.style.display = total ? '' : 'none'
        nuts.current.textContent = `🔩 ${G.vars.nuts ?? 0}/${total}`
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  if (arena) return null
  return (
    <div ref={root} className="sync-meter">
      <div className="sync-label">Sincronía</div>
      <div className="sync-row">
        <div ref={score} className="sync-score">0</div>
        <div ref={mult} className="sync-mult" data-m="1">×1</div>
      </div>
      <div className="sync-bar"><div ref={bar} /></div>
      <div ref={nuts} className="sync-nuts" style={{ display: 'none' }} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Speed lines when something launches you                             */
/* ------------------------------------------------------------------ */

export function SpeedLines() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let raf = 0
    let a = 0
    const loop = () => {
      const me = G.minis[G.session?.localSlot ?? 0]
      const joined = G.form === 'joined'
      const vel = joined ? G.big.vel : me.vel
      const launched = joined ? G.big.launchedT > 0 : me.launchedT > 0 || me.boosting > 0
      const sp = vel.length()
      const target = settings().reduceFlashes ? 0 : launched && sp > 9 ? Math.min(1, (sp - 9) / 6) : 0
      a += (target - a) * 0.15
      if (ref.current) ref.current.style.opacity = String(a * 0.85)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  return <div ref={ref} className="speed-lines" style={{ opacity: 0 }} />
}
