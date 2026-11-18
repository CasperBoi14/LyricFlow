import type { Track } from '../types'
import { formatTime } from '../lib/lyrics'

type Props = {
  source: string
  track: Track | null
  remoteDevice?: string
  remoteDeviceType?: string
  volume: number
  position: number
  duration: number
  playing: boolean
  onVolumeChange: (value: number) => void
  onRefresh: () => void
}

export function SoundPanel({ source, track, remoteDevice, remoteDeviceType, volume, position, duration, playing, onVolumeChange, onRefresh }: Props) {
  if (!track) return null
  const directAudio = !remoteDevice && source.startsWith('audio:')
  const spotify = !remoteDevice && source.startsWith('spotify:')
  let audioHost = ''
  if (directAudio) {
    try { audioHost = new URL(source.slice(6), window.location.href).hostname } catch { /* show the generic label */ }
  }
  const label = remoteDevice ? `Spotify on ${remoteDevice} (${remoteDeviceType || 'device'})`
    : spotify ? 'Spotify player in this browser'
      : directAudio ? `Direct audio from ${audioHost || 'this site'}`
        : source.startsWith('hold:') ? 'Finding an audio source…'
          : 'No live audio source'
  const url = remoteDevice || spotify ? track.externalUrl
    : directAudio ? source.slice(6) : undefined

  return (
    <section className="sound-panel" aria-label="Audio source and sound controls">
      <div className="section-title">Audio source</div>
      <div className="sound-source">{url ? <a href={url} target="_blank" rel="noreferrer">{label} ↗</a> : label}</div>
      <div className="muted small">{playing ? 'Playing' : 'Paused'} · {formatTime(position)} / {formatTime(duration)}</div>
      {remoteDevice && <button className="btn small sound-refresh" onClick={onRefresh}>Check phone now</button>}
      <label className="sound-row">
        <span>Volume</span>
        <input type="range" min={0} max={100} value={volume}
          onChange={(event) => onVolumeChange(Number(event.target.value))}
          disabled={!remoteDevice && !spotify && !directAudio} />
        <output>{volume}%</output>
      </label>
    </section>
  )
}
