import { useMemo } from 'react'
import type { AdState, LyricLine, Track } from '../types'
import { buildWordTimings, ensureTimedLyrics, getActiveLineIndex, lyricTime, wordIndexAt } from '../lib/lyrics'

type Props = {
  track: Track | null
  currentTime: number
  duration: number
  playing: boolean
  delayMs: number
  ad: AdState | null
  onDelayChange: (ms: number) => void
  onClose: () => void
  onTogglePlay: () => void
  onSeek: (t: number) => void
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
const DELAY_LIMIT = 3000

/** Stable per-word pseudo-random value so sizes do not change on every render. */
function seeded(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967295
}

export function FullscreenLyrics({ track, currentTime, duration, playing, delayMs, ad, onDelayChange, onClose, onTogglePlay, onSeek }: Props) {
  const t = lyricTime(currentTime, delayMs)
  const total = duration || track?.duration || 0
  const timed = useMemo(() => track ? ensureTimedLyrics(track.lyrics, total, track.synced) : { lyrics: [] as LyricLine[], simulated: false }, [track, total])
  const lyrics = timed.lyrics
  const activeIndex = useMemo(() => getActiveLineIndex(lyrics, t), [lyrics, t])
  const line = activeIndex >= 0 ? lyrics[activeIndex] : undefined
  const nextLine = lyrics[activeIndex + 1]

  const words = useMemo(() => buildWordTimings(line, nextLine), [line, nextLine])
  const revealed = wordIndexAt(words, t) + 1

  const tokens = useMemo(() => words.slice(0, Math.max(0, revealed)).map((word, i) => ({
    text: word.text,
    scale: 0.72 + seeded(`${track?.id ?? 'track'}:${activeIndex}:${i}:${word.text}`) * 0.78,
    current: i === revealed - 1,
  })), [words, revealed, activeIndex, track?.id])

  /** When the last word has been sung, the sentence clears until the next one starts. */
  const sentenceEndsAt = useMemo(() => {
    if (!line || !words.length) return 0
    const gaps = words.slice(1).map((word, i) => word.t - words[i].t)
    const average = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 2.4
    return words[words.length - 1].t + Math.max(0.9, Math.min(4, average))
  }, [line, words])

  const sentenceDone = !!nextLine && t >= sentenceEndsAt
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
          <div className="stage-delay" title="Adjust when each word appears in 100 ms steps">
            <button onClick={() => delay(-100)} aria-label="Show words 100 milliseconds earlier">−</button>
            <button className="stage-delay-value" onClick={() => onDelayChange(0)} title="Reset lyric delay">
              {delayMs > 0 ? '+' : ''}{delayMs} ms
            </button>
            <button onClick={() => delay(100)} aria-label="Show words 100 milliseconds later">+</button>
          </div>
          <button className="stage-close" onClick={onClose} aria-label="Exit fullscreen lyrics">✕</button>
        </div>
      </header>

      {ad && (
        <div className="stage-ad" role="status" aria-live="polite">
          <span className="ad-tag">AD</span>
          <div className={`ad-track${ad.total > 0 ? '' : ' indeterminate'}`}>
            <i style={{ width: `${(ad.total > 0 ? Math.max(0, Math.min(1, 1 - ad.remaining / ad.total)) : 0) * 100}%` }} />
          </div>
          <span className="ad-time">{ad.total > 0 ? `${Math.ceil(Math.max(0, ad.remaining))}s until the song` : 'waiting for the song'}</span>
        </div>
      )}

      <main className="stage-body">
        <div className="stage-meta">
          <div className="stage-title">{track.title}</div>
          <div className="stage-artist">{track.artist}</div>
        </div>

        <div className="stage-track">
          <div className="line-progress"><i style={{ transform: `scaleX(${lineProgress})` }} /></div>
          <div className="stage-sentence" key={`${track.id}-${activeIndex}`} aria-live="polite">
            {sentenceDone ? null : (
              tokens.map((token, i) => (
                <span
                  key={`${i}-${token.text}`}
                  className={`word-token${token.current ? ' current' : ''}`}
                  style={{ fontSize: `calc(clamp(26px, 4.4vw, 68px) * ${token.scale.toFixed(3)} * var(--lyrics-scale, 1))` }}
                >
                  {token.text}
                </span>
              ))
            )}
          </div>
        </div>
      </main>

      <footer className="stage-footer">
        <button className="stage-play" onClick={onTogglePlay} disabled={!!ad} aria-label={playing ? 'Pause' : 'Play'}>{playing ? '❚❚' : '▶'}</button>
        <div className="stage-progress">
          <input type="range" min={0} max={total || 300} step={0.05} value={Math.min(currentTime, total || 300)} onChange={(e) => onSeek(Number(e.target.value))} disabled={!!ad} aria-label="Seek" />
          <div className="stage-times"><span>{fmt(currentTime)}</span><span>{fmt(total)}</span></div>
        </div>
      </footer>
    </div>
  )
}

function fmt(s: number) { const m = Math.floor((s || 0) / 60); const x = Math.floor((s || 0) % 60); return `${m}:${x.toString().padStart(2, '0')}` }
