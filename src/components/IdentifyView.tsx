import { useMemo, useState } from 'react'
import type { Track } from '../types'
import type { LiveIdentifyState, LiveMatch } from '../lib/useLiveIdentify'
import { resolveToTrack } from '../lib/lrclib'

type Props = {
  live: LiveIdentifyState
  currentTrack: Track | null
  health: number | null
  onOpen: (t: Track) => void
}

export function IdentifyView({ live, currentTrack, health, onOpen }: Props) {
  const [opening, setOpening] = useState<string | null>(null)
  const [openError, setOpenError] = useState<string | null>(null)

  const unique = useMemo(() => {
    const seen = new Set<string>()
    const out: LiveMatch[] = []
    for (const m of live.matches) {
      const key = `${m.title}|${m.artist}`.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(m)
      if (out.length >= 4) break
    }
    return out
  }, [live.matches])

  const open = async (m: LiveMatch) => {
    setOpenError(null)
    setOpening(`${m.title}|${m.artist}`)
    try {
      const track = await resolveToTrack({
        id: `id-${Date.now()}`,
        title: m.title,
        artist: m.artist,
        album: m.album,
        cover: m.cover,
        externalUrl: m.url,
        source: 'identify',
        tags: ['identified'],
      })
      onOpen(track)
    } catch (e: any) {
      setOpenError(e?.message || 'Could not load lyrics for this song.')
    } finally {
      setOpening(null)
    }
  }

  const lastCheck = live.lastAt ? new Date(live.lastAt).toLocaleTimeString() : null

  return (
    <div className="identify">
      <div className="identify-head">
        <h2>Live identify</h2>
        <span className={`status-dot ${live.active ? 'on' : ''}`}>{live.active ? 'Listening' : 'Idle'}</span>
      </div>
      <p className="muted">
        {live.active
          ? 'Keep the music playing. We listen continuously and check every 10 seconds.'
          : 'Listen to the room, identify the song, and check whether the lyrics keep matching.'}
      </p>

      <button
        className={`mic ${live.active ? 'listening' : ''}`}
        onClick={() => (live.active ? live.stop() : live.start())}
        aria-label={live.active ? 'Stop listening' : 'Start listening'}
      >
        {live.active ? '◉' : '🎤'}
      </button>

      <div className="level"><i style={{ transform: `scaleX(${live.level})` }} /></div>
      {live.active && (
        <div className={`mic-hint ${live.level < 0.01 ? 'silent' : ''}`}>
          {live.level < 0.01 ? 'No input detected — check the microphone and Windows sound input.' : 'Microphone input detected'}
        </div>
      )}

      <div className="row center">
        <button className="btn primary" onClick={() => (live.active ? live.stop() : live.start())}>
          {live.active ? 'Stop listening' : 'Start listening'}
        </button>
        {live.active && <button className="btn" onClick={() => void live.checkNow()}>Check now</button>}
      </div>

      <div className="live-meta">
        <span>{live.attempts} checks</span>
        {lastCheck && <span>Last check {lastCheck}</span>}
        {live.active && <span>12s windows</span>}
      </div>

      {live.error && <div className="notice error">{live.error}</div>}
      {openError && <div className="notice error">{openError}</div>}

      {currentTrack && currentTrack.source !== 'demo' && live.active && (
        <div className="health">
          <div>
            <div className="section-title">Live lyric check</div>
            <div className="muted small">{currentTrack.title} · {currentTrack.artist}</div>
          </div>
          <strong>{health == null ? 'waiting…' : `${health}%`}</strong>
        </div>
      )}

      {unique.length > 0 && (
        <div className="live-matches">
          {unique.map((m) => {
            const key = `${m.title}|${m.artist}`
            return (
              <div className="live-match" key={key}>
                {m.cover ? <img src={m.cover} alt="" /> : <div className="live-match-blank" />}
                <div className="live-match-meta">
                  <div className="result-title">{m.title}</div>
                  <div className="muted small">{m.artist}{m.album ? ` · ${m.album}` : ''}</div>
                </div>
                <button className="btn small" onClick={() => void open(m)} disabled={!!opening}>
                  {opening === key ? 'Loading…' : 'Lyrics'}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {!live.active && !live.matches.length && (
        <div className="notice">Your microphone stays on this device. Audio samples are only sent to Shazam for recognition.</div>
      )}
    </div>
  )
}
