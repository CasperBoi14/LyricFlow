type Props = {
  volume: number
  onVolumeChange: (value: number) => void
  delayMs: number
  onDelayChange: (value: number) => void
  lyricSize: number
  onLyricSizeChange: (value: number) => void
  autoFullscreen: boolean
  onAutoFullscreenChange: (value: boolean) => void
}

export function SettingsView(props: Props) {
  return (
    <div className="settings-view">
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
