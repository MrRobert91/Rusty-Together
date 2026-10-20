import { useEffect } from 'react'
import { useApp } from './appStore'
import { Game } from '../game/Game'
import { OfflineSession } from '../net/session'
import { OnlineSession, hostRoom, joinRoom, leaveRoom, onLobby, useLobby } from '../net/online'
import { initAudio, setMusic, sfx } from '../core/audio'
import { stopVoice, startVoice, voiceLobbyMode } from '../net/voice'
import { useSettings } from '../core/settings'
import { TitleScreen, MainMenu, JoinScreen } from './Menus'
import { Lobby } from './Lobby'
import { Hud, useDevice } from './Hud'
import { TouchControls, RotateHint } from './TouchControls'
import { PauseMenu } from './PauseMenu'
import { SettingsPanel, ControlsPanel } from './Settings'
import { MenuBackdrop } from './MenuBackdrop'
import { useHud, toast } from '../game/hud'

export function startSolo(level = 'tutorial') {
  initAudio()
  const app = useApp.getState()
  app.session?.dispose()
  app.set({ screen: 'game', level, session: new OfflineSession(), runId: app.runId + 1 })
}

export function startOnline(level: string) {
  const app = useApp.getState()
  app.session?.dispose()
  app.set({ screen: 'game', level, session: new OnlineSession(), runId: app.runId + 1 })
}

export function backToMenu() {
  const app = useApp.getState()
  app.session?.dispose()
  if (document.pointerLockElement) document.exitPointerLock()
  if (app.session?.mode === 'online') {
    leaveRoom()
    stopVoice()
  }
  useHud.setState({ paused: false, levelDone: null })
  app.set({ screen: 'menu', session: null })
  setMusic('menu')
}

export function backToLobby() {
  const app = useApp.getState()
  app.session?.dispose()
  if (document.pointerLockElement) document.exitPointerLock()
  useHud.setState({ paused: false, levelDone: null })
  app.set({ screen: 'lobby', session: null })
  voiceLobbyMode()
  setMusic('menu')
}

export function App() {
  const screen = useApp((s) => s.screen)
  const level = useApp((s) => s.level)
  const session = useApp((s) => s.session)
  const runId = useApp((s) => s.runId)
  const settingsOpen = useApp((s) => s.settingsOpen)
  const controlsOpen = useApp((s) => s.controlsOpen)
  const device = useDevice()

  // Lobby events → screens.
  useEffect(() => {
    const offs = [
      onLobby('start', (d: { level: string }) => startOnline(d.level)),
      onLobby('to-lobby', () => backToLobby()),
      onLobby('host-left', () => { backToMenu(); toast('El anfitrión ha cerrado la sala.', 'warn', 4000) }),
      onLobby('peer-left', () => {
        if (useApp.getState().screen === 'game') { backToLobby(); toast('Tu compañero ha salido de la partida.', 'warn', 4000) }
      }),
      onLobby('left', () => {
        const s = useApp.getState().screen
        if (s === 'lobby' || s === 'game') { backToMenu(); toast('Conexión con la sala perdida.', 'warn', 4000) }
      }),
    ]
    return () => offs.forEach((o) => o())
  }, [])

  // Dev / test shortcuts: ?solo&level=sandbox, ?host, ?join=CODE
  useEffect(() => {
    const q = new URLSearchParams(location.search)
    const name = q.get('name') || useSettings.getState().playerName || 'Robot'
    if (q.has('solo')) startSolo(q.get('level') || 'tutorial')
    else if (q.has('host')) { hostRoom(name).then(() => { if (useLobby.getState().status === 'lobby') { useApp.getState().set({ screen: 'lobby' }); startVoice() } }) }
    else if (q.get('join')) { joinRoom(q.get('join')!, name).then(() => { if (useLobby.getState().status === 'lobby') { useApp.getState().set({ screen: 'lobby' }); startVoice() } }) }
  }, [])

  const inGame = screen === 'game' && session
  return (
    <div className={`app dev-${device}`}>
      {!inGame && <MenuBackdrop />}
      {inGame && <Game key={runId} level={level} session={session} />}
      {inGame && <Hud />}
      {inGame && device === 'touch' && <TouchControls />}
      {inGame && <PauseMenu />}
      {inGame && device === 'touch' && <RotateHint />}
      {screen === 'title' && <TitleScreen onStart={() => { initAudio(); setMusic('menu'); sfx('go'); useApp.getState().set({ screen: 'menu' }) }} />}
      {screen === 'menu' && <MainMenu />}
      {screen === 'join' && <JoinScreen />}
      {screen === 'lobby' && <Lobby />}
      {settingsOpen && <SettingsPanel />}
      {controlsOpen && <ControlsPanel />}
      {!inGame && <ToastLayer />}
    </div>
  )
}

function ToastLayer() {
  const toasts = useHud((s) => s.toasts)
  return (
    <div className="toasts">
      {toasts.map((t) => <div key={t.id} className={`toast ${t.tone}`}>{t.text}</div>)}
    </div>
  )
}
