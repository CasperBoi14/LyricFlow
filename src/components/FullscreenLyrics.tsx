import { useEffect, useMemo, useRef, useState } from 'react'
import type { LyricLine, Track } from '../types'
import { buildWordTimings, ensureTimedLyrics, getActiveLineIndex, wordIndexAt } from '../lib/lyrics'

type Props = {
  track: Track | null
  currentTime: number
  duration: number
  playing: boolean
  delayMs: number
  onDelayChange: (ms: number) => void
  onClose: () => void
  onTogglePlay: () => void
  onSeek: (t: number) => void
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
const DELAY_LIMIT = 3000

export function FullscreenLyrics({ track, currentTime, duration, playing, delayMs, onDelayChange, onClose, onTogglePlay, onSeek }: Props) {
  const t = currentTime - delayMs / 1000
  const total = duration || track?.duration || 0
  const timed = useMemo(() => track ? ensureTimedLyrics(track.lyrics, total, track.synced) : { lyrics: [] as LyricLine[], simulated: false }, [track, total])
  const lyrics = timed.lyrics
  const activeIndex = useMemo(() => getActiveLineIndex(lyrics, t), [lyrics, t])
  const line = activeIndex >= 0 ? lyrics[activeIndex] : lyrics[0]
  const nextLine = lyrics[activeIndex + 1]
  const prevLine = activeIndex > 0 ? lyrics[activeIndex - 1] : null

  const words = useMemo(() => buildWordTimings(line, nextLine), [line, nextLine])
  const activeWordIdx = wordIndexAt(words, t)
  const safeIdx = Math.max(0, activeWordIdx)
  const prevWord = words[safeIdx - 1]
  const currentWord = words[safeIdx]
  const upcoming = words.slice(safeIdx + 1, safeIdx + 3).map(w => w.text).join(' ')
  const fallbackNext = nextLine?.text ?? ''

  const [wordKey, setWordKey] = useState(0)
  const lastWordRef = useRef(-2)
  useEffect(() => {
    if (activeWordIdx !== lastWordRef.current) {
      lastWordRef.current = activeWordIdx
      setWordKey(k => k + 1)
    }
  }, [activeWordIdx])

  const wordProgress = useMemo(() => {
    if (!currentWord) return 0
    const end = words[safeIdx + 1]?.t ?? nextLine?.time ?? currentWord.t + 2
    return clamp((t - currentWord.t) / Math.max(0.35, end - currentWord.t), 0, 1)
  }, [t, currentWord, words, safeIdx, nextLine])

  const lineProgress = useMemo(() => {
    if (!line) return 0
    const end = nextLine?.time ?? line.time + 4
    return clamp((t - line.time) / Math.max(0.8, end - line.time), 0, 1)
  }, [t, line, nextLine])

  if (!track) return null

  const delay = (delta: number) => onDelayChange(clamp(delayMs + delta, -DELAY_LIMIT, DELAY_LIMIT))

  return (
    <div className="stage">
      <div className="stage-art" style={track.cover?.startsWith('http') ? { backgroundImage: `url(${track.cover})` } : { background: track.cover }} />
      <div className="stage-veil" />

      <header className="stage-top">
        <div className="stage-controls">
          <div className="stage-delay" title="Lyric delay in milliseconds — positive values show lyrics later">
            <button onClick={() => delay(-100)} aria-label="Lyrics earlier">−</button>
            <button className="stage-delay-value" onClick={() => onDelayChange(0)} title="Reset lyric delay">
              {delayMs > 0 ? '+' : ''}{delayMs} ms
            </button>
            <button onClick={() => delay(100)} aria-label="Lyrics later">+</button>
          </div>
          <button className="stage-close" onClick={onClose} aria-label="Exit fullscreen lyrics">✕</button>
        </div>
      </header>

      <main className="stage-body">
        <div className="stage-meta">
          <div className="stage-title">{track.title}</div>
          <div className="stage-artist">{track.artist}</div>
        </div>

        <div className="stage-track">
          <div className="line-progress"><i style={{ transform: `scaleX(${lineProgress})` }} /></div>
          <div className="word-stack" key={wordKey}>
            <div className="word ghost prev" aria-hidden>{prevWord ? prevWord.text : (prevLine?.text ?? '')}</div>
            <div className="word current">
              <span className="word-main">{currentWord?.text ?? '♪'}</span>
              <span className="word-bar"><i style={{ transform: `scaleX(${wordProgress})` }} /></span>
            </div>
            <div className="word ghost next" aria-hidden>{upcoming || fallbackNext}</div>
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
