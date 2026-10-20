import { useEffect, useState } from 'react'
import { useSettings, type Settings } from '../core/settings'
import { useApp } from './appStore'
import { MenuButton, useMenuPad } from './Menus'
import { glyph, type Btn } from '../core/input'

function Slider({ label, k, min = 0, max = 1, step = 0.05 }: { label: string; k: keyof Settings; min?: number; max?: number; step?: number }) {
  const v = useSettings((s) => s[k]) as number
  const set = useSettings((s) => s.set)
  return (
    <label className="setting">
      <span>{label}</span>
      <input data-nav type="range" min={min} max={max} step={step} value={v} onChange={(e) => set({ [k]: Number(e.target.value) } as Partial<Settings>)} onInput={(e) => set({ [k]: Number((e.target as HTMLInputElement).value) } as Partial<Settings>)} />
      <b>{Math.round(v * 100)}%</b>
    </label>
  )
}

function Toggle({ label, k, hint }: { label: string; k: keyof Settings; hint?: string }) {
  const v = useSettings((s) => s[k]) as boolean
  const set = useSettings((s) => s.set)
  return (
    <label className="setting toggle">
      <span>{label}{hint && <small>{hint}</small>}</span>
      <input data-nav type="checkbox" checked={v} onChange={(e) => set({ [k]: e.target.checked } as Partial<Settings>)} />
    </label>
  )
}

export function SettingsPanel() {
  const close = () => useApp.getState().set({ settingsOpen: false })
  useMenuPad(close)
  const quality = useSettings((s) => s.quality)
  const set = useSettings((s) => s.set)
  const micId = useSettings((s) => s.micDeviceId)
  const [mics, setMics] = useState<MediaDeviceInfo[]>([])
  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices().then((d) => setMics(d.filter((x) => x.kind === 'audioinput'))).catch(() => {})
    const key = (e: KeyboardEvent) => { if (e.code === 'Escape') { e.stopPropagation(); close() } }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [])
  return (
    <div className="overlay">
      <div className="menu-panel settings-panel">
        <h2>Ajustes</h2>
        <div className="settings-cols">
          <div>
            <h4>Audio</h4>
            <Slider label="Volumen general" k="masterVolume" />
            <Slider label="Música" k="musicVolume" />
            <Slider label="Efectos" k="sfxVolume" />
            <Slider label="Voz del compañero" k="voiceVolume" max={1.5} />
            <Toggle label="Pulsar para hablar (V)" k="pushToTalk" />
            {mics.length > 0 && (
              <label className="setting">
                <span>Micrófono</span>
                <select data-nav value={micId} onChange={(e) => set({ micDeviceId: e.target.value })}>
                  <option value="">Predeterminado</option>
                  {mics.map((m) => <option key={m.deviceId} value={m.deviceId}>{m.label || 'Micrófono'}</option>)}
                </select>
              </label>
            )}
            <h4>Gráficos</h4>
            <label className="setting">
              <span>Calidad gráfica<small>Automática ajusta según tu equipo y los FPS</small></span>
              <select data-nav value={quality} onChange={(e) => set({ quality: e.target.value as Settings['quality'] })}>
                <option value="auto">Automática</option>
                <option value="high">Alta (AO, bloom, sombras finas)</option>
                <option value="medium">Media (bloom, sombras)</option>
                <option value="low">Baja (máxima fluidez)</option>
              </select>
            </label>
            <Toggle label="Mostrar FPS y latencia" k="showFps" />
          </div>
          <div>
            <h4>Control</h4>
            <Slider label="Sensibilidad del ratón" k="mouseSensitivity" min={0.2} max={3} />
            <Slider label="Sensibilidad del stick" k="stickSensitivity" min={0.2} max={3} />
            <Toggle label="Invertir eje vertical" k="invertY" />
            <Toggle label="Agarre alterno (RT pulsar en vez de mantener)" k="grabToggle" />
            <h4>Pantalla táctil</h4>
            <Slider label="Sensibilidad al arrastrar" k="touchSensitivity" min={0.3} max={2.5} />
            <Slider label="Tamaño de los botones" k="touchScale" min={0.8} max={1.3} />
            <Toggle label="Vibración" k="haptics" />
            <h4>Accesibilidad</h4>
            <Toggle label="Modo ayuda" k="assist" hint="Sincronía a 450 ms, agarres más anchos, más alcance" />
            <Toggle label="Reducir sacudidas de cámara" k="reduceShake" />
            <Toggle label="Reducir destellos" k="reduceFlashes" />
          </div>
        </div>
        <MenuButton primary onClick={close}>Hecho</MenuButton>
      </div>
    </div>
  )
}

const ROWS: [Btn | 'move' | 'look', string, string][] = [
  ['move', 'Moverse', 'Dirigir tu pierna'],
  ['look', 'Cámara', 'Apuntar tu brazo'],
  ['jump', 'Saltar (mantén = más alto)', 'Impulso de tu pierna · dos impulsos juntos = salto conjunto'],
  ['brake', 'Agacharse · trampolín para tu compañero', 'Anclar tu pierna (pivote)'],
  ['grab', 'Agarrar · ofrecer la mano · coger cajas', 'Agarrar asas con tu mano'],
  ['primary', 'Lanzar puño cableado (4 m)', 'Lanzar brazo telescópico (8 m) · tirachinas'],
  ['secondary', 'Recoger cable · cargar el muelle', 'Tensar tu cable'],
  ['couple', 'Mantener: acoplarse en una placa', 'Mantener: separarse'],
  ['signal', 'Señalar un punto', 'Señalar un punto'],
  ['emote1', 'Gestos (1-4 / cruceta)', 'Gestos'],
  ['talk', 'Pulsar para hablar · M silencia', ''],
]

export function ControlsPanel() {
  const close = () => useApp.getState().set({ controlsOpen: false })
  useMenuPad(close)
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.code === 'Escape') { e.stopPropagation(); close() } }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [])
  return (
    <div className="overlay">
      <div className="menu-panel controls-panel">
        <h2>Controles</h2>
        <table className="controls">
          <thead><tr><th>Mando</th><th>Teclado / ratón</th><th>Mini robot</th><th>Cuerpo unido</th></tr></thead>
          <tbody>
            {ROWS.map(([b, mini, big]) => (
              <tr key={b}>
                <td><span className="key pad">{b === 'move' ? 'L' : b === 'look' ? 'R' : glyph(b, 'pad')}</span></td>
                <td><span className="key kbm wide">{b === 'move' ? 'WASD' : b === 'look' ? 'Ratón' : glyph(b, 'kbm')}</span></td>
                <td>{mini}</td>
                <td>{big}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">Unidos, cada jugador controla su mitad: Cian el brazo y la pierna izquierdos y Ámbar los derechos. La dirección del cuerpo es la media de vuestras dos piernas.</p>
        <MenuButton primary onClick={close}>Entendido</MenuButton>
      </div>
    </div>
  )
}
