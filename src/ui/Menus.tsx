import { useEffect, useRef, useState } from 'react'
import { useApp } from './appStore'
import { startSolo } from './App'
import { hostRoom, joinRoom, useLobby } from '../net/online'
import { sfx } from '../core/audio'
import { useSettings } from '../core/settings'
import { startVoice } from '../net/voice'
import { CODE_LENGTH, normalizeCode } from '../../shared/protocol'
import { getPad } from '../core/input'

/** Gamepad navigation for any menu: D-pad/stick moves focus, A clicks, B goes back. */
export function useMenuPad(onBack?: () => void) {
  useEffect(() => {
    let raf = 0
    let prev = { up: false, down: false, a: false, b: false, left: false, right: false }
    let hold = 0
    const loop = () => {
      const p = getPad()
      if (p) {
        const y = p.axes[1] ?? 0
        const x = p.axes[0] ?? 0
        const cur = {
          up: p.buttons[12]?.pressed || y < -0.6, down: p.buttons[13]?.pressed || y > 0.6,
          left: p.buttons[14]?.pressed || x < -0.6, right: p.buttons[15]?.pressed || x > 0.6,
          a: p.buttons[0]?.pressed, b: p.buttons[1]?.pressed,
        }
        const items = Array.from(document.querySelectorAll<HTMLElement>('[data-nav]:not([disabled])'))
        const idx = items.indexOf(document.activeElement as HTMLElement)
        const move = (d: number) => {
          if (!items.length) return
          const n = items[(idx + d + items.length) % items.length]
          n.focus()
          sfx('hover')
        }
        if (cur.down && (!prev.down || hold > 18)) { move(1); hold = cur.down && prev.down ? 12 : 0 }
        if (cur.up && (!prev.up || hold > 18)) { move(-1); hold = cur.up && prev.up ? 12 : 0 }
        if ((cur.left && !prev.left) || (cur.right && !prev.right)) {
          const el = document.activeElement as HTMLInputElement | null
          if (el?.type === 'range') {
            const step = Number(el.step || 0.05) * (cur.right ? 1 : -1)
            el.value = String(Math.min(Number(el.max), Math.max(Number(el.min), Number(el.value) + step)))
            el.dispatchEvent(new Event('input', { bubbles: true }))
          }
        }
        if (cur.down || cur.up) hold++
        else hold = 0
        if (cur.a && !prev.a) { (document.activeElement as HTMLElement | null)?.click(); if (idx < 0) move(0) }
        if (cur.b && !prev.b) onBack?.()
        prev = cur as typeof prev
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [onBack])
}

export function MenuButton({ children, onClick, primary, disabled, icon, sub }: { children: React.ReactNode; onClick: () => void; primary?: boolean; disabled?: boolean; icon?: string; sub?: string }) {
  return (
    <button
      data-nav
      className={`menu-btn ${primary ? 'primary' : ''}`}
      disabled={disabled}
      onMouseEnter={() => sfx('hover')}
      onFocus={() => sfx('hover')}
      onClick={() => { sfx('click'); onClick() }}
    >
      {icon && <span className="menu-btn-icon">{icon}</span>}
      <span className="menu-btn-text">
        <span>{children}</span>
        {sub && <small>{sub}</small>}
      </span>
    </button>
  )
}

export function Logo({ small }: { small?: boolean }) {
  return (
    <div className={`logo ${small ? 'small' : ''}`}>
      <div className="logo-main"><span className="c">DOS</span> <span className="a">A</span> <span className="u">UNO</span></div>
      <div className="logo-sub">RUSTY TOGETHER</div>
    </div>
  )
}

export function TitleScreen({ onStart }: { onStart: () => void }) {
  useEffect(() => {
    const go = (e: Event) => { if ((e as KeyboardEvent).key === 'Tab') return; onStart() }
    window.addEventListener('keydown', go, { once: true })
    window.addEventListener('pointerdown', go, { once: true })
    let raf = 0
    const poll = () => {
      const p = getPad()
      if (p && p.buttons.some((b) => b.pressed)) { onStart(); return }
      raf = requestAnimationFrame(poll)
    }
    raf = requestAnimationFrame(poll)
    return () => { window.removeEventListener('keydown', go); window.removeEventListener('pointerdown', go); cancelAnimationFrame(raf) }
  }, [onStart])
  return (
    <div className="screen title-screen">
      <Logo />
      <p className="tagline">Dos robots. Un cuerpo. Ningún acuerdo sobre dónde poner el pie.</p>
      <div className="press-any">Pulsa cualquier tecla o botón</div>
      <div className="title-foot">Cooperativo online para 2 · Chat de voz de proximidad · Mando recomendado</div>
    </div>
  )
}

export function MainMenu() {
  const name = useSettings((s) => s.playerName)
  const set = useSettings((s) => s.set)
  const lobby = useLobby()
  const app = useApp()
  const [busy, setBusy] = useState(false)
  useMenuPad()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { ref.current?.querySelector<HTMLElement>('[data-nav]')?.focus() }, [])

  const host = async () => {
    setBusy(true)
    await hostRoom(name || 'Anfitrión')
    setBusy(false)
    if (useLobby.getState().status === 'lobby') { app.set({ screen: 'lobby' }); startVoice() }
  }

  return (
    <div className="screen menu-screen" ref={ref}>
      <Logo small />
      <div className="menu-panel">
        <label className="name-field">
          <span>Tu nombre</span>
          <input data-nav value={name} maxLength={16} placeholder="Robot sin nombre" onChange={(e) => set({ playerName: e.target.value })} />
        </label>
        <MenuButton primary icon="🎓" sub="Un jugador · aprende con Ámbar-bot" onClick={() => startSolo('tutorial')}>Tutorial: Taller de pruebas</MenuButton>
        <MenuButton icon="🏠" sub="Crea una sala privada y comparte el código" disabled={busy} onClick={host}>Crear sala (anfitrión)</MenuButton>
        <MenuButton icon="🔑" sub="Introduce el código de tu amigo" onClick={() => app.set({ screen: 'join' })}>Unirse con código</MenuButton>
        <div className="menu-row">
          <MenuButton icon="⚙️" onClick={() => app.set({ settingsOpen: true })}>Ajustes</MenuButton>
          <MenuButton icon="🎮" onClick={() => app.set({ controlsOpen: true })}>Controles</MenuButton>
        </div>
        {lobby.error && <div className="error">{lobby.error}</div>}
      </div>
      <div className="menu-foot">Nivel 1 · Muelles de rebote — Muestra vertical · v0.1</div>
    </div>
  )
}

export function JoinScreen() {
  const [code, setCode] = useState('')
  const name = useSettings((s) => s.playerName)
  const lobby = useLobby()
  const app = useApp()
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const back = () => app.set({ screen: 'menu' })
  useMenuPad(back)
  useEffect(() => { inputs.current[0]?.focus() }, [])

  const join = async (c = code) => {
    await joinRoom(c, name || 'Invitado')
    if (useLobby.getState().status === 'lobby') { app.set({ screen: 'lobby' }); startVoice() }
  }

  const onChar = (i: number, v: string) => {
    const clean = normalizeCode(v)
    if (clean.length > 1) {
      // Pasted a whole code.
      const full = normalizeCode(clean).slice(0, CODE_LENGTH)
      setCode(full)
      if (full.length === CODE_LENGTH) join(full)
      return
    }
    const arr = code.padEnd(CODE_LENGTH, ' ').split('')
    arr[i] = clean || ' '
    const next = arr.join('').replace(/\s+$/, '')
    setCode(next)
    if (clean && i < CODE_LENGTH - 1) inputs.current[i + 1]?.focus()
    if (next.replace(/\s/g, '').length === CODE_LENGTH) join(next.replace(/\s/g, ''))
  }

  return (
    <div className="screen menu-screen">
      <Logo small />
      <div className="menu-panel">
        <h2>Unirse a una sala</h2>
        <p className="muted">Pide a tu amigo el código de 5 caracteres que aparece en su sala.</p>
        <div className="code-input">
          {Array.from({ length: CODE_LENGTH }, (_, i) => (
            <input
              key={i}
              ref={(el) => { inputs.current[i] = el }}
              value={code[i]?.trim() ?? ''}
              maxLength={CODE_LENGTH}
              onChange={(e) => onChar(i, e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Backspace' && !code[i] && i > 0) inputs.current[i - 1]?.focus(); if (e.key === 'Enter') join() }}
              autoCapitalize="characters"
              spellCheck={false}
            />
          ))}
        </div>
        <MenuButton primary icon="🚀" disabled={lobby.status === 'connecting'} onClick={() => join()}>{lobby.status === 'connecting' ? 'Conectando…' : 'Unirse'}</MenuButton>
        <MenuButton icon="←" onClick={back}>Volver</MenuButton>
        {lobby.error && <div className="error">{lobby.error}</div>}
      </div>
    </div>
  )
}
