import { settings } from './settings'

/** Logical buttons, named after the GDD pad layout. */
export type Btn =
  | 'jump' // A
  | 'brake' // B
  | 'primary' // RT / X – hook: hold to latch and reel in, release to let go
  | 'couple' // Y  – hold to couple / decouple
  | 'grab' // LT – grab / offer hand
  | 'signal' // RB – ping
  | 'camera' // LB
  | 'pause'
  | 'emote1'
  | 'emote2'
  | 'emote3'
  | 'emote4'
  | 'talk'
  | 'mute'

export const BTNS: Btn[] = ['jump', 'brake', 'primary', 'couple', 'grab', 'signal', 'camera', 'pause', 'emote1', 'emote2', 'emote3', 'emote4', 'talk', 'mute']

export type Device = 'kbm' | 'pad' | 'touch'

export interface InputFrame {
  /** Left stick, x = right, y = forward. Magnitude ≤ 1. */
  move: { x: number; y: number }
  /** Camera look delta for this frame, in radians. */
  look: { x: number; y: number }
  /** Right stick raw (used for arm aim offsets in the joined body). */
  aim: { x: number; y: number }
  held: Record<Btn, boolean>
  pressed: Record<Btn, boolean>
  released: Record<Btn, boolean>
  device: Device
}

const KEYMAP: Record<string, Btn> = {
  Space: 'jump',
  ShiftLeft: 'brake',
  ShiftRight: 'brake',
  KeyC: 'brake',
  KeyF: 'primary',
  KeyR: 'couple',
  KeyE: 'grab',
  KeyQ: 'grab',
  KeyG: 'signal',
  Escape: 'pause',
  KeyP: 'pause',
  Digit1: 'emote1',
  Digit2: 'emote2',
  Digit3: 'emote3',
  Digit4: 'emote4',
  KeyV: 'talk',
  KeyM: 'mute',
}
const MOUSEMAP: Record<number, Btn> = { 0: 'primary', 2: 'grab', 1: 'signal' }
const PADMAP: Record<number, Btn> = {
  0: 'jump', 1: 'brake', 2: 'primary', 3: 'couple', 4: 'camera', 5: 'signal', 9: 'pause', 8: 'mute',
  12: 'emote1', 13: 'emote2', 14: 'emote3', 15: 'emote4',
}

function blank(): Record<Btn, boolean> {
  const o = {} as Record<Btn, boolean>
  for (const b of BTNS) o[b] = false
  return o
}

const keys = new Set<string>()
const mouseButtons = new Set<number>()
// Taps shorter than a frame still count as one press.
const tappedKeys = new Set<string>()
const tappedMouse = new Set<number>()
let mouseDX = 0
let mouseDY = 0
let lastDevice: Device = typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0) ? 'touch' : 'kbm'
let prevHeld = blank()
let enabled = true
const listeners = new Set<(d: Device) => void>()

/**
 * Virtual controls write here (see ui/TouchControls). Stick is already
 * normalised; look deltas are in CSS pixels and consumed once per frame.
 */
export const touch = {
  move: { x: 0, y: 0 },
  lookDX: 0,
  lookDY: 0,
  held: new Set<Btn>(),
  tapped: new Set<Btn>(),
}
if (import.meta.env.DEV && typeof window !== 'undefined') (window as any).__touch = touch
export function touchPress(b: Btn) { touch.held.add(b); touch.tapped.add(b); setDevice('touch') }
export function touchRelease(b: Btn) { touch.held.delete(b) }
export function touchClear() { touch.held.clear(); touch.tapped.clear(); touch.move.x = touch.move.y = 0; touch.lookDX = touch.lookDY = 0 }

export function setDevice(d: Device) {
  if (d !== lastDevice) {
    lastDevice = d
    listeners.forEach((l) => l(d))
  }
}

export function onDeviceChange(cb: (d: Device) => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
export const currentDevice = () => lastDevice

function isTyping(e: Event) {
  const t = e.target as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
}

let installed = false
export function installInput() {
  if (installed) return
  installed = true
  window.addEventListener('keydown', (e) => {
    if (isTyping(e)) return
    keys.add(e.code)
    if (!e.repeat) tappedKeys.add(e.code)
    setDevice('kbm')
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault()
  })
  window.addEventListener('keyup', (e) => keys.delete(e.code))
  window.addEventListener('touchstart', () => setDevice('touch'), { passive: true, capture: true })
  window.addEventListener('blur', () => { keys.clear(); mouseButtons.clear(); touchClear() })
  window.addEventListener('mousedown', (e) => {
    if (!document.pointerLockElement) return
    mouseButtons.add(e.button)
    tappedMouse.add(e.button)
    setDevice('kbm')
  })
  window.addEventListener('mouseup', (e) => mouseButtons.delete(e.button))
  window.addEventListener('contextmenu', (e) => { if (document.pointerLockElement) e.preventDefault() })
  window.addEventListener('mousemove', (e) => {
    if (!document.pointerLockElement) return
    mouseDX += e.movementX
    mouseDY += e.movementY
  })
  document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement) mouseButtons.clear() })
}

export function setInputEnabled(v: boolean) {
  enabled = v
  if (!v) { keys.clear(); mouseButtons.clear(); touchClear() }
}

function deadzone(x: number, y: number, dz = 0.18) {
  const m = Math.hypot(x, y)
  if (m < dz) return { x: 0, y: 0 }
  const k = Math.min(1, (m - dz) / (1 - dz)) / m
  return { x: x * k, y: y * k }
}

export function getPad(): Gamepad | null {
  const pads = navigator.getGamepads ? navigator.getGamepads() : []
  for (const p of pads) if (p && p.connected) return p
  return null
}

/** Poll once per rendered frame. */
export function pollInput(dt: number): InputFrame {
  const held = blank()
  let mx = 0
  let my = 0
  let lx = 0
  let ly = 0
  let ax = 0
  let ay = 0
  const s = settings()

  if (enabled) {
    for (const k of keys) {
      const b = KEYMAP[k]
      if (b) held[b] = true
    }
    for (const k of tappedKeys) {
      const b = KEYMAP[k]
      if (b) held[b] = true
    }
    for (const m of mouseButtons) {
      const b = MOUSEMAP[m]
      if (b) held[b] = true
    }
    for (const m of tappedMouse) {
      const b = MOUSEMAP[m]
      if (b) held[b] = true
    }
    if (keys.has('KeyW') || keys.has('ArrowUp')) my += 1
    if (keys.has('KeyS') || keys.has('ArrowDown')) my -= 1
    if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1
    if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1
    const n = Math.hypot(mx, my)
    if (n > 1) { mx /= n; my /= n }
    const sens = 0.0024 * s.mouseSensitivity
    lx = -mouseDX * sens
    ly = -mouseDY * sens * (s.invertY ? -1 : 1)
    if (mouseDX || mouseDY) { ax = Math.max(-1, Math.min(1, mouseDX * 0.05)); ay = Math.max(-1, Math.min(1, -mouseDY * 0.05)) }

    for (const b of touch.held) held[b] = true
    for (const b of touch.tapped) held[b] = true
    if (Math.hypot(touch.move.x, touch.move.y) > Math.hypot(mx, my)) { mx = touch.move.x; my = touch.move.y }
    if (touch.lookDX || touch.lookDY) {
      // Finger drags: a bit faster than the mouse, with a light acceleration
      // curve so small corrections stay precise and big swipes turn around.
      const ts = 0.0052 * s.touchSensitivity
      const acc = (d: number) => d * (1 + Math.min(1.2, Math.abs(d) * 0.025))
      lx += -acc(touch.lookDX) * ts
      ly += -acc(touch.lookDY) * ts * (s.invertY ? -1 : 1)
    }

    const pad = getPad()
    if (pad) {
      const l = deadzone(pad.axes[0] ?? 0, pad.axes[1] ?? 0)
      const r = deadzone(pad.axes[2] ?? 0, pad.axes[3] ?? 0, 0.15)
      let used = Math.abs(l.x) + Math.abs(l.y) + Math.abs(r.x) + Math.abs(r.y) > 0
      pad.buttons.forEach((b, i) => {
        const name = PADMAP[i]
        const on = b.pressed || b.value > 0.4
        if (on) used = true
        if (name && on) held[name] = true
      })
      // Triggers carry the two "hold" verbs: RT hooks, LT grabs.
      if ((pad.buttons[6]?.value ?? 0) > 0.3) held.grab = true
      if ((pad.buttons[7]?.value ?? 0) > 0.3) held.primary = true
      if (used) setDevice('pad')
      if (Math.abs(l.x) + Math.abs(l.y) > Math.abs(mx) + Math.abs(my)) { mx = l.x; my = -l.y }
      const ps = 3.2 * s.stickSensitivity * dt
      // Curve the stick for fine aim near the centre.
      const cx = Math.sign(r.x) * r.x * r.x
      const cy = Math.sign(r.y) * r.y * r.y
      lx += -cx * ps
      ly += -cy * ps * 0.7 * (s.invertY ? -1 : 1)
      if (r.x || r.y) { ax = r.x; ay = -r.y }
    }
  }
  mouseDX = 0
  mouseDY = 0
  tappedKeys.clear()
  tappedMouse.clear()
  touch.tapped.clear()
  touch.lookDX = 0
  touch.lookDY = 0

  const pressed = blank()
  const released = blank()
  for (const b of BTNS) {
    pressed[b] = held[b] && !prevHeld[b]
    released[b] = !held[b] && prevHeld[b]
  }
  prevHeld = held
  return { move: { x: mx, y: my }, look: { x: lx, y: ly }, aim: { x: ax, y: ay }, held, pressed, released, device: lastDevice }
}

export function emptyFrame(): InputFrame {
  return { move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, aim: { x: 0, y: 0 }, held: blank(), pressed: blank(), released: blank(), device: lastDevice }
}

export function rumble(strong: number, weak: number, ms: number) {
  const pad = getPad() as (Gamepad & { vibrationActuator?: { playEffect?: (t: string, p: object) => void } }) | null
  try {
    pad?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak })
  } catch { /* unsupported */ }
  if (lastDevice === 'touch') haptic(Math.min(ms, 30 + 50 * strong))
}

/** Short vibration on phones (ignored where unsupported or disabled). */
export function haptic(ms: number) {
  if (!settings().haptics || typeof navigator === 'undefined' || !navigator.vibrate) return
  try { navigator.vibrate(Math.round(ms)) } catch { /* unsupported */ }
}

/** Human readable glyph for a logical button on the current device. */
export function glyph(b: Btn, device: Device = lastDevice): string {
  if (device === 'touch') return TOUCH_GLYPH[b]
  if (device === 'pad') {
    return ({ jump: 'A', brake: 'B', primary: 'RT', couple: 'Y', grab: 'LT', signal: 'RB', camera: 'LB', pause: '☰', emote1: '↑', emote2: '→', emote3: '↓', emote4: '←', talk: '—', mute: '⧉' } as Record<Btn, string>)[b]
  }
  return ({ jump: 'Espacio', brake: 'Shift', primary: 'Clic izq.', couple: 'R', grab: 'Clic der.', signal: 'G', camera: 'Ratón', pause: 'Esc', emote1: '1', emote2: '2', emote3: '3', emote4: '4', talk: 'V', mute: 'M' } as Record<Btn, string>)[b]
}

/** Touch glyphs match the icons drawn on the on-screen buttons. */
export const TOUCH_GLYPH: Record<Btn, string> = {
  jump: '⤒', brake: '⤓', primary: '🪝', couple: '∞', grab: '✋', signal: '!', camera: '◎',
  pause: 'II', emote1: '👋', emote2: '👍', emote3: '❤', emote4: '😂', talk: '🎙', mute: '🔇',
}

/** Short verb shown next to each glyph when text names a button. */
const VERB: Partial<Record<Btn, string>> = { jump: 'Saltar', brake: 'Agachar', primary: 'Gancho', couple: 'Unir', grab: 'Agarrar' }

/**
 * Level text names buttons with tokens such as `{primary}` or `{grab}`; they
 * become the glyph of the device in use, so one string serves keyboard, pad
 * and touch (`{primary}` → «Clic izq.», «RT» or «🪝 Gancho»).
 */
export function deviceText(s: string, device: Device = lastDevice) {
  if (!s || s.indexOf('{') < 0) return s
  return s.replace(/\{(\w+)\}/g, (all, b: string) => {
    if (!(BTNS as string[]).includes(b)) return all
    const g = glyph(b as Btn, device)
    return device === 'touch' && VERB[b as Btn] ? `${g} ${VERB[b as Btn]}` : g
  })
}
