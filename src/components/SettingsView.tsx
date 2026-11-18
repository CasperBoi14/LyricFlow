import { SpotifyAccountSettings } from './SpotifyAccountSettings'
import { ThemeStudio } from './ThemeStudio'
import type { VisualPreset, VisualSettings } from '../lib/visualSettings'

type Props = {
  volume: number
  onVolumeChange: (value: number) => void
  delayMs: number
  onDelayChange: (value: number) => void
  lyricSize: number
  onLyricSizeChange: (value: number) => void
  autoFullscreen: boolean
  onAutoFullscreenChange: (value: boolean) => void
  spotifyConnected: boolean
  spotifyConnecting: boolean
  spotifyError: string | null
  spotifyDeviceName?: string
  onSpotifyConnect: (clientId?: string) => void
  onSpotifyDisconnect: () => void
  onDismissSpotifyError: () => void
  onSpotifyTransferred: () => void
  spotifySyncMs: number
  onSpotifySyncChange: (value: number) => void
  visual: VisualSettings
  presets: VisualPreset[]
  onVisualChange: (patch: Partial<VisualSettings>) => void
  onSavePreset: (name: string) => void
  onApplyPreset: (preset: VisualPreset) => void
  onDeletePreset: (name: string) => void
  onResetVisual: () => void
  onClearHistory: () => void
}

export function SettingsView(props: Props) {
  return (
    <div className="settings-view">
      <SpotifyAccountSettings connected={props.spotifyConnected} connecting={props.spotifyConnecting} error={props.spotifyError}
        deviceName={props.spotifyDeviceName} onConnect={props.onSpotifyConnect} onDisconnect={props.onSpotifyDisconnect}
        onDismissError={props.onDismissSpotifyError} onTransferred={props.onSpotifyTransferred} />
      <section className="settings-card">
        <h2>Spotify sync</h2>
        <label className="settings-slider"><span>Check active playback <output>{props.spotifySyncMs / 1000}s</output></span>
          <input type="range" min={3000} max={30000} step={3000} value={props.spotifySyncMs} onChange={(event) => props.onSpotifySyncChange(Number(event.target.value))} /></label>
        <p className="muted small">Faster checks use more Spotify requests. LyricFlow slows checks automatically when Spotify returns 429.</p>
      </section>
      <ThemeStudio value={props.visual} presets={props.presets} onChange={props.onVisualChange}
        onSave={props.onSavePreset} onApply={props.onApplyPreset} onDelete={props.onDeletePreset} onReset={props.onResetVisual} />
      <section className="settings-card">
        <h2>Quiet modes</h2>
        <label className="settings-switch"><span>Show floating lyrics widget</span><input type="checkbox" checked={props.visual.widget} onChange={(event) => props.onVisualChange({ widget: event.target.checked })} /></label>
        <label className="settings-slider"><span>Widget position</span><select className="select" value={props.visual.widgetPosition} onChange={(event) => props.onVisualChange({ widgetPosition: event.target.value as VisualSettings['widgetPosition'] })}><option value="bottom-right">Bottom right</option><option value="top-right">Top right</option></select></label>
        <label className="settings-slider"><span>Ambient screensaver <output>{props.visual.screensaverMinutes ? `${props.visual.screensaverMinutes} min` : 'Off'}</output></span>
          <input type="range" min={0} max={10} step={1} value={props.visual.screensaverMinutes} onChange={(event) => props.onVisualChange({ screensaverMinutes: Number(event.target.value) })} /></label>
        <p className="muted small">The screensaver starts after inactivity while this page is open. Move, tap, or press a key to exit.</p>
      </section>
      <section className="settings-card"><h2>Privacy</h2><p className="muted small">Listening history is saved only in this browser. It is based on playback LyricFlow observed.</p><button className="btn small danger" onClick={props.onClearHistory}>Clear listening history</button></section>
      <section className="settings-card">
        <h2>Playback</h2>
        <label className="settings-slider">
          <span>Volume <output>{props.volume}%</output></span>
          <input type="range" min={0} max={100} value={props.volume} onChange={(event) => props.onVolumeChange(Number(event.target.value))} />
        </label>
        <p className="muted small">Controls this browser’s player. Spotify device volume is sent to the active device when supported.</p>
      </section>
      <section className="settings-card">
        <h2>Lyrics</h2>
        <label className="settings-slider">
          <span>Word timing <output>{props.delayMs > 0 ? '+' : ''}{props.delayMs} ms</output></span>
          <input type="range" min={-3000} max={3000} step={100} value={props.delayMs} onChange={(event) => props.onDelayChange(Number(event.target.value))} />
        </label>
        <p className="muted small">Word timestamps are used when the lyric source has them. Otherwise, words are estimated between synced lines. Adjust the offset if the source runs early or late.</p>
        <label className="settings-slider">
          <span>Text size <output>{props.lyricSize}%</output></span>
          <input type="range" min={80} max={160} step={5} value={props.lyricSize} onChange={(event) => props.onLyricSizeChange(Number(event.target.value))} />
        </label>
        <label className="settings-switch">
          <span>Open full-screen lyrics when I play a song</span>
          <input type="checkbox" checked={props.autoFullscreen} onChange={(event) => props.onAutoFullscreenChange(event.target.checked)} />
        </label>
      </section>
    </div>
  )
}
