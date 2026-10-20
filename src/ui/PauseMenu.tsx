import { useEffect } from 'react'
import { useHud } from '../game/hud'
import { G } from '../game/runtime'
import { useApp } from './appStore'
import { backToMenu, startSolo } from './App'
import { MenuButton, useMenuPad } from './Menus'
import { getPad, setInputEnabled } from '../core/input'
import { lobbySend } from '../net/online'
import { reachCheckpoint } from '../game/levels/checkpoints'
import { killMini } from '../game/robots/miniController'

function setPaused(on: boolean, broadcast = true) {
  G.paused = on
  useHud.setState({ paused: on })
  setInputEnabled(!on)
  if (on && document.pointerLockElement) document.exitPointerLock()
  if (broadcast && G.session?.mode === 'online') G.session.send('pause', { on })
  if (!on) {
    const c = document.querySelector('canvas')
    if (c && !document.pointerLockElement) c.requestPointerLock?.()
  }
}

export function PauseMenu() {
  const paused = useHud((s) => s.paused)
  const done = useHud((s) => s.levelDone)
  const session = useApp((s) => s.session)
  const app = useApp()

  // Esc / P / Start toggles. Losing pointer lock (Esc in browsers) opens the menu.
  useEffect(() => {
    let autoPausedAt = 0
    const key = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (useHud.getState().levelDone || useApp.getState().settingsOpen || useApp.getState().controlsOpen) return
        if (performance.now() - autoPausedAt < 400) return
        setPaused(!useHud.getState().paused)
      }
    }
    const lock = () => {
      if (!document.pointerLockElement && !useHud.getState().paused && !useHud.getState().levelDone && useApp.getState().screen === 'game' && !useApp.getState().settingsOpen) {
        // Browser exits pointer lock on Esc without a reliable key event.
        autoPausedAt = performance.now()
        setPaused(true)
      }
    }
    let raf = 0
    let prev = false
    const poll = () => {
      const p = getPad()
      const on = !!p?.buttons[9]?.pressed
      if (on && !prev && !useHud.getState().levelDone) setPaused(!useHud.getState().paused)
      prev = on
      raf = requestAnimationFrame(poll)
    }
    raf = requestAnimationFrame(poll)
    window.addEventListener('keydown', key)
    document.addEventListener('pointerlockchange', lock)
    return () => { window.removeEventListener('keydown', key); document.removeEventListener('pointerlockchange', lock); cancelAnimationFrame(raf) }
  }, [])

  useEffect(() => () => { setInputEnabled(true) }, [])
  useMenuPad(paused ? () => setPaused(false) : undefined)
  if (!paused || done) return null
  const online = session?.mode === 'online'

  const restartRoom = () => {
    setPaused(false)
    // Respawn at the active checkpoint: the room restarts, completed rooms stay done.
    const me = G.minis[G.session!.localSlot]
    if (G.form === 'split') killMini(me)
    else if (G.session!.isHost) { G.big.dead = true; G.big.deadT = G.time }
    void reachCheckpoint
  }

  return (
    <div className="pause">
      <div className="menu-panel pause-panel">
        <h2>Pausa{online ? ' (para los dos)' : ''}</h2>
        <MenuButton primary icon="▶" onClick={() => setPaused(false)}>Continuar</MenuButton>
        <MenuButton icon="↺" sub="Vuelves al último refugio" onClick={restartRoom}>Reaparecer</MenuButton>
        {!online && <MenuButton icon="⟲" onClick={() => startSolo(useApp.getState().level)}>Reiniciar tutorial</MenuButton>}
        <MenuButton icon="⚙️" onClick={() => app.set({ settingsOpen: true })}>Ajustes</MenuButton>
        <MenuButton icon="🎮" onClick={() => app.set({ controlsOpen: true })}>Controles</MenuButton>
        {online && session?.isHost && <MenuButton icon="⌂" onClick={() => { setPaused(false); lobbySend('lobby') }}>Volver a la sala</MenuButton>}
        <MenuButton icon="✕" onClick={() => { setPaused(false, true); backToMenu() }}>Salir al menú</MenuButton>
      </div>
    </div>
  )
}
