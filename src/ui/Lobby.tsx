import { useState } from 'react'
import { useLobby, lobbySend, leaveRoom } from '../net/online'
import { useVoice, enableMic, toggleMute, stopVoice } from '../net/voice'
import { useApp } from './appStore'
import { MenuButton, Logo, useMenuPad } from './Menus'
import { useSettings } from '../core/settings'
import { SLOT_NAME } from '../game/tuning'
import { sfx } from '../core/audio'

export function Lobby() {
  const lobby = useLobby()
  const voice = useVoice()
  const app = useApp()
  const ptt = useSettings((s) => s.pushToTalk)
  const assist = useSettings((s) => s.assist)
  const setS = useSettings((s) => s.set)
  const [copied, setCopied] = useState(false)
  const me = lobby.players.find((p) => p.sessionId === lobby.mySessionId)
  const isHost = !!me?.isHost
  const full = lobby.players.length === 2
  const guest = lobby.players.find((p) => !p.isHost)
  const canStart = isHost && full && !!guest?.ready && guest.connected

  const leave = () => { leaveRoom(); stopVoice(); app.set({ screen: 'menu' }) }
  useMenuPad(leave)

  const copy = async () => {
    try { await navigator.clipboard.writeText(lobby.code) } catch { /* ignore */ }
    setCopied(true)
    sfx('pop')
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="screen lobby-screen">
      <Logo small />
      <div className="lobby-grid">
        <div className="menu-panel code-panel">
          <div className="muted">Código de la sala</div>
          <button className="room-code" data-nav onClick={copy} title="Copiar">
            {lobby.code.split('').map((c, i) => <span key={i}>{c}</span>)}
          </button>
          <div className="muted small">{copied ? '¡Copiado!' : 'Pulsa para copiar y compártelo con tu amigo'}</div>
          <div className="level-card">
            <div className="level-thumb" />
            <div>
              <div className="level-title">Nivel 1 · Muelles de rebote</div>
              <div className="muted small">6 salas · Elasticidad y confianza · ~20 min</div>
            </div>
          </div>
          <label className="toggle-row">
            <input type="checkbox" data-nav checked={assist} onChange={(e) => setS({ assist: e.target.checked })} />
            <span>Modo ayuda (ventanas de sincronía de 450 ms, agarres más anchos)</span>
          </label>
        </div>

        <div className="menu-panel players-panel">
          {[0, 1].map((slot) => {
            const p = lobby.players.find((x) => x.slot === slot)
            return (
              <div key={slot} className={`player-card slot${slot} ${p ? '' : 'empty'}`}>
                <div className="player-avatar"><div className="visor"><i /><i /></div></div>
                <div className="player-info">
                  <div className="player-role">{SLOT_NAME[slot]} · {slot === 0 ? 'brazo y pierna izquierdos' : 'brazo y pierna derechos'}</div>
                  <div className="player-name">{p ? p.name : 'Esperando jugador…'}{p?.sessionId === lobby.mySessionId ? ' (tú)' : ''}</div>
                  <div className="player-tags">
                    {p?.isHost && <span className="tag">Anfitrión</span>}
                    {p && !p.isHost && <span className={`tag ${p.ready ? 'ok' : ''}`}>{p.ready ? 'Listo' : 'No listo'}</span>}
                    {p && !p.connected && <span className="tag warn">Reconectando…</span>}
                    {p?.sessionId === lobby.mySessionId ? voice.talking && voice.localLevel > 0.02 && <span className="tag talk">🎙 hablando</span> : p && voice.remoteSpeaking && <span className="tag talk">🔊 hablando</span>}
                  </div>
                </div>
              </div>
            )
          })}
          <MenuButton icon="⇄" onClick={() => lobbySend('swap')} sub="Cambia quién es Cian y quién Ámbar">Intercambiar colores</MenuButton>
          {!isHost && <MenuButton primary icon={me?.ready ? '✓' : '○'} onClick={() => lobbySend('ready', !me?.ready)}>{me?.ready ? 'Listo' : 'Marcar como listo'}</MenuButton>}
          {isHost && <MenuButton primary icon="▶" disabled={!canStart} onClick={() => lobbySend('start')} sub={!full ? 'Esperando a que se una tu amigo' : !guest?.ready ? 'Esperando a que tu amigo esté listo' : '¡A jugar!'}>Empezar nivel 1</MenuButton>}
        </div>

        <div className="menu-panel voice-panel">
          <h3>Chat de voz de proximidad</h3>
          <p className="muted small">Os oiréis más alto cuanto más cerca estén vuestros robots, y desde su dirección. Ningún obstáculo exige hablar.</p>
          {voice.micState !== 'on' ? (
            <MenuButton icon="🎙" onClick={enableMic}>{voice.micState === 'requesting' ? 'Pidiendo permiso…' : voice.micState === 'denied' ? 'Micrófono denegado: reintentar' : 'Activar micrófono'}</MenuButton>
          ) : (
            <>
              <div className="mic-meter"><div style={{ width: `${Math.min(100, voice.localLevel * 400)}%` }} /></div>
              <MenuButton icon={voice.muted ? '🔇' : '🔊'} onClick={toggleMute}>{voice.muted ? 'Silenciado (M)' : 'Micrófono abierto (M)'}</MenuButton>
            </>
          )}
          <label className="toggle-row">
            <input type="checkbox" data-nav checked={ptt} onChange={(e) => setS({ pushToTalk: e.target.checked })} />
            <span>Pulsar para hablar (V)</span>
          </label>
          <div className={`voice-status ${voice.connected ? 'ok' : ''}`}>{voice.connected ? 'Voz conectada con tu compañero' : full ? 'Conectando voz…' : 'La voz se conectará cuando llegue tu amigo'}</div>
          <MenuButton icon="←" onClick={leave}>Salir de la sala</MenuButton>
        </div>
      </div>
    </div>
  )
}
