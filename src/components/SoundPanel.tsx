import type { Track } from '../types'
import type { SoundSettings } from '../lib/audioEffects'

type Props = {
  source: string
  track: Track | null
  remoteDevice?: string
  remoteDeviceType?: string
  sound: SoundSettings
  onChange: (key: keyof SoundSettings, value: number) => void
  onRefresh: () => void
}

export function SoundPanel({ source, track, remoteDevice, remoteDeviceType, sound, onChange, onRefresh }: Props) {
  if (!track) return null
  const directAudio = !remoteDevice && source.startsWith('audio:')
  const youtube = !remoteDevice && source.startsWith('yt:')
  const spotify = !remoteDevice && source.startsWith('spotify:')
  let audioHost = ''
  if (directAudio) {
    try { audioHost = new URL(source.slice(6), window.location.href).hostname } catch { /* show the generic label */ }
  }
  const label = remoteDevice ? `Spotify on ${remoteDevice} (${remoteDeviceType || 'device'})`
    : spotify ? 'Spotify player in this browser'
      : youtube ? 'YouTube player in this browser'
        : directAudio ? `Direct audio from ${audioHost || 'this site'}`
          : source.startsWith('hold:') ? 'Finding an audio source…'
            : 'No live audio source'
  const url = remoteDevice || spotify ? track.externalUrl
    : youtube ? `https://www.youtube.com/watch?v=${source.slice(3)}`
      : directAudio ? source.slice(6) : undefined

  const slider = (key: keyof SoundSettings, title: string, min: number, max: number, disabled = false) => (
    <label className="sound-row" key={key}>
      <span>{title}</span>
      <input type="range" min={min} max={max} step={1} value={sound[key]}
        onChange={(event) => onChange(key, Number(event.target.value))} disabled={disabled} />
      <output>{sound[key]}{key === 'volume' || key === 'vocals' ? '%' : ' dB'}</output>
    </label>
  )

  return (
    <section className="sound-panel" aria-label="Audio source and sound controls">
      <div className="section-title">Audio source</div>
      <div className="sound-source">{url ? <a href={url} target="_blank" rel="noreferrer">{label} ↗</a> : label}</div>
      {remoteDevice && <button className="btn small sound-refresh" onClick={onRefresh}>Check phone now</button>}
      {slider('volume', 'Volume', 0, 100, !remoteDevice && !spotify && !youtube && !directAudio)}
      {slider('bass', 'Bass', -12, 12, !directAudio)}
      {slider('treble', 'Treble', -12, 12, !directAudio)}
      {slider('vocals', 'Vocal reduction', 0, 100, !directAudio)}
      <p className="muted small">Vocal reduction uses stereo center cancellation. It works on direct audio only and may also remove centered instruments.</p>
    </section>
  )
}
