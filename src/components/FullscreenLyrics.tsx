import { useEffect, useMemo, useRef } from 'react'
import type { LyricLine, Track } from '../types'
import { buildWordTimings, ensureTimedLyrics, getActiveLineIndex, lyricTime, wordIndexAt } from '../lib/lyrics'

type Props = {
  track: Track | null
  currentTime: number
  duration: number
  playing: boolean
  delayMs: number
  onDelayChange: (ms: number) => void
  browserFullscreen: boolean
  onEnterBrowserFullscreen: () => void
  onClose: () => void
  onTogglePlay: () => void
  onSeek: (t: number) => void
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
const DELAY_LIMIT = 3000

export function FullscreenLyrics({ track, currentTime, duration, playing, delayMs, onDelayChange, browserFullscreen, onEnterBrowserFullscreen, onClose, onTogglePlay, onSeek }: Props) {
  const t = lyricTime(currentTime, delayMs)
  const total = duration || track?.duration || 0
  const timed = useMemo(() => track ? ensureTimedLyrics(track.lyrics, total, track.synced) : { lyrics: [] as LyricLine[], simulated: false }, [track, total])
  const lyrics = timed.lyrics
  const activeIndex = useMemo(() => getActiveLineIndex(lyrics, t), [lyrics, t])
  const line = activeIndex >= 0 ? lyrics[activeIndex] : undefined
  const nextLine = lyrics[activeIndex + 1]

  const words = useMemo(() => line ? buildWordTimings(line, nextLine) : [], [line, nextLine])
  const activeWord = wordIndexAt(words, t)
  const lineProgress = useMemo(() => {
    if (!line) return 0
    const end = nextLine?.time ?? line.time + 4
    return clamp((t - line.time) / Math.max(0.8, end - line.time), 0, 1)
  }, [t, line, nextLine])

  const controls = useRef({ onClose, onTogglePlay, onSeek, currentTime })
  useEffect(() => { controls.current = { onClose, onTogglePlay, onSeek, currentTime } })
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { controls.current.onClose(); return }
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement) return
      if (event.key === ' ') { event.preventDefault(); controls.current.onTogglePlay() }
      if (event.key === 'ArrowRight') { event.preventDefault(); controls.current.onSeek(controls.current.currentTime + 5) }
      if (event.key === 'ArrowLeft') { event.preventDefault(); controls.current.onSeek(Math.max(0, controls.current.currentTime - 5)) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!track) return null

  const delay = (delta: number) => onDelayChange(clamp(delayMs + delta, -DELAY_LIMIT, DELAY_LIMIT))

  return (
    <div className="stage">
      <div className="stage-art" key={track.id} style={track.cover?.startsWith('http') ? { backgroundImage: `url(${track.cover})` } : { background: track.cover }} />
      <div className="stage-veil" />

      <header className="stage-top">
        <div className="stage-controls">
          <div className="stage-delay" title="Adjust when each word appears in 100 ms steps">
            <button onClick={() => delay(-100)} aria-label="Show words 100 milliseconds earlier">−</button>
            <button className="stage-delay-value" onClick={() => onDelayChange(0)} title="Reset lyric delay">
              {delayMs > 0 ? '+' : ''}{delayMs} ms
            </button>
            <button onClick={() => delay(100)} aria-label="Show words 100 milliseconds later">+</button>
          </div>
          {!browserFullscreen && document.fullscreenEnabled && (
            <button className="stage-fill-screen" onClick={onEnterBrowserFullscreen}>Fill screen</button>
          )}
          <button className="stage-close" onClick={onClose} aria-label="Exit fullscreen lyrics">✕</button>
        </div>
      </header>

      <main className="stage-body">
        <div className="stage-meta">
          <div className="stage-title">{track.title}</div>
          <div className="stage-artist">{track.artist}</div>
          <div className="stage-timing-note">{timed.simulated ? 'Line timing estimated' : line?.words?.length ? 'Word synced lyrics' : 'Word timing estimated from synced lines'}</div>
        </div>

        <div className="stage-track">
          <div className="line-progress"><i style={{ transform: `scaleX(${lineProgress})` }} /></div>
          <div className="stage-sentence" key={`${track.id}-${activeIndex}`} aria-live="off">
            {words.length ? words.map((word, i) => (
                <span
                  key={`${i}-${word.text}`}
                  className={`word-token${i === activeWord ? ' current' : i < activeWord ? ' sung' : ' upcoming'}`}
                >
                  {word.text}
                </span>
              )) : <span className="stage-line-fallback">{line?.text || 'Waiting for lyrics…'}</span>}
          </div>
        </div>
      </main>

      <footer className="stage-footer">
        <button className="stage-play" onClick={onTogglePlay} aria-label={playing ? 'Pause' : 'Play'}>{playing ? '❚❚' : '▶'}</button>
        <div className="stage-progress">
          <input type="range" min={0} max={total || 300} step={0.05} value={Math.min(currentTime, total || 300)} onChange={(e) => onSeek(Number(e.target.value))} aria-label="Seek" />
          <div className="stage-times"><span>{fmt(currentTime)}</span><span>{fmt(total)}</span></div>
        </div>
      </footer>
    </div>
  )
}

function fmt(s: number) { const m = Math.floor((s || 0) / 60); const x = Math.floor((s || 0) % 60); return `${m}:${x.toString().padStart(2, '0')}` }
