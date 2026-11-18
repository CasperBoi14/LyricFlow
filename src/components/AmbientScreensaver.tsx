import { useEffect, useMemo, useState } from 'react'
import type { Track } from '../types'
import { ensureTimedLyrics, getActiveLineIndex, lyricTime } from '../lib/lyrics'

export function AmbientScreensaver({ track, time, delayMs, onExit }: { track: Track; time: number; delayMs: number; onExit: () => void }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1_000)
    return () => window.clearInterval(timer)
  }, [])
  const lyrics = useMemo(() => ensureTimedLyrics(track.lyrics, track.duration, track.synced).lyrics, [track])
  const line = lyrics[getActiveLineIndex(lyrics, lyricTime(time, delayMs))]?.text || track.title
  return <div className="ambient-screensaver" onPointerMove={onExit} onTouchStart={onExit} onClick={onExit} onKeyDown={onExit} role="button" tabIndex={0} aria-label="Exit ambient screensaver">
    <div className="screensaver-art" style={{ backgroundImage: track.cover.startsWith('http') ? `url(${track.cover})` : undefined }} />
    <div className="screensaver-shade" />
    <time>{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
    <div className="screensaver-content"><img src={track.cover.startsWith('http') ? track.cover : `${import.meta.env.BASE_URL}favicon.svg`} alt="" /><h2>{line}</h2><p>{track.title} · {track.artist}</p></div>
    <span className="screensaver-hint">Move, tap, or press a key to return</span>
  </div>
}
