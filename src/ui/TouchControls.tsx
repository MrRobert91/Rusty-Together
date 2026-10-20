import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { haptic, touch, touchClear, touchPress, touchRelease, TOUCH_GLYPH, type Btn } from '../core/input'
import { useSettings } from '../core/settings'
import { useHud } from '../game/hud'
import { useApp } from './appStore'
import { setPaused } from './PauseMenu'

/**
 * Mobile controls, laid out for two thumbs in landscape:
 *  - left half: floating stick that appears under the thumb,
 *  - right half: drag anywhere to look (or aim the arm when joined),
 *  - bottom-right: buttons on arcs around the big jump button, so the thumb
 *    rolls between them without looking. Sliding from one button onto another
 *    transfers the press (jump → grab to catch a hand mid-air); dragging off a
 *    button keeps it held and turns the camera.
 */

interface BtnDef { b: Btn; label: string; size: number; angle: number; ring: 0 | 1 | 2; tone: string }

const DEFS: BtnDef[] = [
  { b: 'jump', label: 'Saltar', size: 1, angle: 0, ring: 0, tone: 'a' },
  { b: 'primary', label: 'Puño', size: 0.78, angle: 180, ring: 1, tone: 'x' },
  { b: 'secondary', label: 'Tensar', size: 0.78, angle: 132, ring: 1, tone: 'lt' },
  { b: 'grab', label: 'Agarrar', size: 0.78, angle: 84, ring: 1, tone: 'rt' },
  { b: 'brake', label: 'Agachar', size: 0.62, angle: 180, ring: 2, tone: 'b' },
  { b: 'couple', label: 'Unir', size: 0.62, angle: 138, ring: 2, tone: 'y' },
]

const EMOTES: Btn[] = ['emote1', 'emote2', 'emote3', 'emote4']

interface Rect { b: Btn; x: number; y: number; r: number }

function useViewport() {
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
  useEffect(() => {
    const f = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', f)
    window.visualViewport?.addEventListener('resize', f)
    return () => { window.removeEventListener('resize', f); window.visualViewport?.removeEventListener('resize', f) }
  }, [])
  return vp
}

function safeInsets() {
  const cs = getComputedStyle(document.documentElement)
  const px = (v: string) => parseFloat(cs.getPropertyValue(v)) || 0
  return { l: px('--sal'), r: px('--sar'), b: px('--sab'), t: px('--sat') }
}

export function TouchControls() {
  const scale = useSettings((s) => s.touchScale)
  const ptt = useSettings((s) => s.pushToTalk)
  const online = useApp((s) => s.session?.mode === 'online')
  const prompts = useHud((s) => s.prompts)
  const paused = useHud((s) => s.paused)
  const done = useHud((s) => s.levelDone)
  const form = useHud((s) => s.form)
  const vp = useViewport()
  const [held, setHeld] = useState<Set<Btn>>(() => new Set())
  const [emotesOpen, setEmotesOpen] = useState(false)
  const stickRef = useRef<HTMLDivElement>(null)
  const knobRef = useRef<HTMLDivElement>(null)

  // Geometry in CSS pixels, recomputed on resize / scale change.
  const L = Math.max(62, Math.min(96, vp.h * 0.2)) * scale
  const stickR = Math.max(52, Math.min(78, vp.h * 0.16)) * scale
  const layout = useMemo(() => {
    const ins = safeInsets()
    const cx = vp.w - ins.r - 20 - L / 2
    const cy = vp.h - ins.b - 20 - L / 2
    const gap = 0.12 * L
    const rects: Rect[] = DEFS.map((d) => {
      const s = d.size * L
      const r1 = L / 2 + 0.39 * L + gap * 2.2
      const r2 = r1 + 0.39 * L + s / 2 + gap
      const dist = d.ring === 0 ? 0 : d.ring === 1 ? r1 : r2
      const a = (d.angle * Math.PI) / 180
      return { b: d.b, x: cx + Math.cos(a) * dist, y: cy - Math.sin(a) * dist, r: s / 2 }
    })
    const stickHome = { x: ins.l + 28 + stickR * 1.25, y: vp.h - ins.b - 28 - stickR * 1.1 }
    return { rects, stickHome, ins }
  }, [vp.w, vp.h, L, stickR])
  const layoutRef = useRef(layout)
  layoutRef.current = layout

  // Pointer bookkeeping lives outside React so moves never re-render.
  const st = useRef({
    stick: { id: -1, ox: 0, oy: 0 },
    look: { id: -1, x: 0, y: 0 },
    btn: new Map<number, { b: Btn; x: number; y: number }>(),
  })

  const hintBtns = useMemo(() => new Set(prompts.map((p) => p.btn).filter(Boolean) as Btn[]), [prompts])

  useEffect(() => () => touchClear(), [])
  useEffect(() => { if (paused || done) { touchClear(); st.current.btn.clear(); st.current.stick.id = -1; st.current.look.id = -1; setHeld(new Set()); placeStick(null) } }, [paused, done]) // eslint-disable-line react-hooks/exhaustive-deps

  function placeStick(p: { x: number; y: number } | null, kx = 0, ky = 0) {
    const el = stickRef.current
    const k = knobRef.current
    if (!el || !k) return
    const home = layoutRef.current.stickHome
    const at = p ?? home
    el.style.transform = `translate(${at.x - stickR}px, ${at.y - stickR}px)`
    el.classList.toggle('active', !!p)
    k.style.transform = `translate(${kx}px, ${ky}px)`
  }
  useEffect(() => placeStick(null), [layout]) // eslint-disable-line react-hooks/exhaustive-deps

  const hit = (x: number, y: number) => {
    for (const r of layoutRef.current.rects) {
      // Generous hit circles: fingers are fat and eyes are on the game.
      if (Math.hypot(x - r.x, y - r.y) < r.r * 1.18) return r.b
    }
    return null
  }

  const refreshHeld = () => setHeld(new Set([...st.current.btn.values()].map((v) => v.b)))

  const down = (b: Btn) => { touchPress(b); haptic(b === 'jump' ? 12 : 8) }

  function onDown(e: React.PointerEvent) {
    e.preventDefault()
    tryFullscreen()
    const s = st.current
    const x = e.clientX
    const y = e.clientY
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    const b = hit(x, y)
    if (b) {
      s.btn.set(e.pointerId, { b, x, y })
      down(b)
      refreshHeld()
      return
    }
    if (x < vp.w * 0.42 && s.stick.id < 0 && y > vp.h * 0.22) {
      // Floating stick: centre where the thumb lands, kept off the edges.
      const ox = Math.max(layout.ins.l + stickR + 8, Math.min(vp.w * 0.42, x))
      const oy = Math.max(stickR + 8, Math.min(vp.h - layout.ins.b - stickR - 8, y))
      s.stick = { id: e.pointerId, ox, oy }
      moveStick(x, y)
      return
    }
    if (s.look.id < 0) s.look = { id: e.pointerId, x, y }
  }

  function moveStick(x: number, y: number) {
    const s = st.current.stick
    let dx = x - s.ox
    let dy = y - s.oy
    const d = Math.hypot(dx, dy)
    // Drag the base along when the thumb overshoots, so direction changes
    // never need a long return trip.
    if (d > stickR * 1.35) {
      const k = (d - stickR * 1.35) / d
      s.ox += dx * k
      s.oy += dy * k
      dx = x - s.ox
      dy = y - s.oy
    }
    const m = Math.hypot(dx, dy)
    const clamped = Math.min(m, stickR)
    const kx = m > 0 ? (dx / m) * clamped : 0
    const ky = m > 0 ? (dy / m) * clamped : 0
    placeStick({ x: s.ox, y: s.oy }, kx, ky)
    // Small deadzone, then full speed slightly before the rim.
    const n = m / stickR
    const dz = 0.12
    const out = n < dz ? 0 : Math.min(1, (n - dz) / (0.86 - dz))
    touch.move.x = m > 0 ? (dx / m) * out : 0
    touch.move.y = m > 0 ? (-dy / m) * out : 0
  }

  function onMove(e: React.PointerEvent) {
    const s = st.current
    const x = e.clientX
    const y = e.clientY
    if (e.pointerId === s.stick.id) { moveStick(x, y); return }
    if (e.pointerId === s.look.id) {
      touch.lookDX += x - s.look.x
      touch.lookDY += y - s.look.y
      s.look.x = x
      s.look.y = y
      return
    }
    const bp = s.btn.get(e.pointerId)
    if (bp) {
      const over = hit(x, y)
      if (over && over !== bp.b) {
        // Slide onto a neighbour: hand the press over.
        touchRelease(bp.b)
        bp.b = over
        down(over)
        refreshHeld()
      } else if (!over) {
        // Off the buttons: keep holding and steer the camera with the same thumb.
        touch.lookDX += x - bp.x
        touch.lookDY += y - bp.y
      }
      bp.x = x
      bp.y = y
    }
  }

  function onUp(e: React.PointerEvent) {
    const s = st.current
    if (e.pointerId === s.stick.id) {
      s.stick.id = -1
      touch.move.x = touch.move.y = 0
      placeStick(null)
    } else if (e.pointerId === s.look.id) {
      s.look.id = -1
    } else {
      const bp = s.btn.get(e.pointerId)
      if (bp) {
        s.btn.delete(e.pointerId)
        if (![...s.btn.values()].some((v) => v.b === bp.b)) touchRelease(bp.b)
        refreshHeld()
      }
    }
  }

  const tap = (b: Btn) => (e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    touchPress(b)
    haptic(8)
    window.setTimeout(() => touchRelease(b), 90)
  }
  const holdBtn = (b: Btn) => ({
    onPointerDown: (e: React.PointerEvent) => { e.stopPropagation(); e.preventDefault(); touchPress(b); haptic(8) },
    onPointerUp: (e: React.PointerEvent) => { e.stopPropagation(); touchRelease(b) },
    onPointerCancel: () => touchRelease(b),
    onPointerLeave: () => touchRelease(b),
  })

  if (paused || done) return null
  const vars = { '--L': `${L}px`, '--SR': `${stickR}px` } as CSSProperties
  return (
    <div className="touch-layer" style={vars} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onContextMenu={(e) => e.preventDefault()}>
      <div className="t-stick" ref={stickRef}><div className="t-knob" ref={knobRef} /></div>
      {DEFS.map((d) => {
        const r = layout.rects.find((x) => x.b === d.b)!
        const label = form === 'joined' && d.b === 'couple' ? 'Separar' : form === 'joined' && d.b === 'jump' ? 'Salto' : d.label
        return (
          <div key={d.b} className={`t-btn t-${d.tone} ${held.has(d.b) ? 'on' : ''} ${hintBtns.has(d.b) ? 'hint' : ''}`}
            style={{ left: r.x - r.r, top: r.y - r.r, width: r.r * 2, height: r.r * 2 }}>
            <span className="t-glyph">{TOUCH_GLYPH[d.b]}</span>
            <span className="t-label">{label}</span>
          </div>
        )
      })}
      <div className="t-top" style={{ top: layout.ins.t + 10, right: layout.ins.r + 12 }}>
        {online && (ptt
          ? <div className="t-mini" {...holdBtn('talk')}>🎙</div>
          : <div className="t-mini" onPointerDown={tap('mute')}>🎙</div>)}
        <div className={`t-mini ${hintBtns.has('signal') ? 'hint' : ''}`} onPointerDown={tap('signal')}>!</div>
        <div className={`t-mini ${emotesOpen ? 'on' : ''}`} onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); setEmotesOpen((v) => !v) }}>☺</div>
        <div className="t-mini" onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); setPaused(true) }}>II</div>
        {emotesOpen && (
          <div className="t-emotes">
            {EMOTES.map((b) => <div key={b} className="t-mini" onPointerDown={(e) => { tap(b)(e); setEmotesOpen(false) }}>{TOUCH_GLYPH[b]}</div>)}
          </div>
        )}
      </div>
    </div>
  )
}

let fsTried = false
/** Phones: go fullscreen + landscape on the first touch in game (needs a gesture). */
function tryFullscreen() {
  if (fsTried) return
  fsTried = true
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void }
  if (document.fullscreenElement) return
  const p = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : (el.webkitRequestFullscreen?.(), undefined)
  Promise.resolve(p).then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> })?.lock?.('landscape')).catch(() => {})
}

/** Portrait warning: the controls are laid out for landscape. */
export function RotateHint() {
  return (
    <div className="rotate-hint">
      <div className="rotate-phone" />
      <div>Gira el móvil</div>
      <small>Dos a Uno se juega en horizontal</small>
    </div>
  )
}
