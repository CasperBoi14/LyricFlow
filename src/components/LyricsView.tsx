import { useEffect, useMemo, useRef } from 'react'
import type { LyricLine, Track } from '../types'
import { buildWordTimings, ensureTimedLyrics, getActiveLineIndex, wordIndexAt } from '../lib/lyrics'

type Props = {
  track: Track | null
  currentTime: number
  duration: number
  delayMs: number
  onOpenFullscreen: () => void
}

export function LyricsView({ track, currentTime, duration, delayMs, onOpenFullscreen }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const activeRef = useRef<HTMLDivElement | null>(null)

  const timed = useMemo(() => track ? ensureTimedLyrics(track.lyrics, duration || track.duration, track.synced) : { lyrics: [] as LyricLine[], simulated: false }, [track, duration])
  const lyrics = timed.lyrics
  const t = currentTime - delayMs / 1000
  const activeIndex = useMemo(() => getActiveLineIndex(lyrics, t), [lyrics, t])
  const activeLine = activeIndex >= 0 ? lyrics[activeIndex] : undefined
  const activeWords = useMemo(() => buildWordTimings(activeLine, lyrics[activeIndex + 1]), [activeLine, lyrics, activeIndex])
  const activeWord = wordIndexAt(activeWords, t)

  useEffect(() => {
    if (activeRef.current && containerRef.current) {
      activeRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [activeIndex, track?.id])

  if (!track) return <div className="empty">Select or search a track to see live web-sourced subtitles.</div>

  return (
    <div className="lyrics-pane">
      <div className="lyrics-header">
        <div className="section-title">Lyrics</div>
        <button className="btn small" onClick={onOpenFullscreen}>⛶ Fullscreen</button>
      </div>
      <div className="lyrics-scroll" ref={containerRef}>
        {lyrics.map((line: LyricLine, i) => {
          const isActive = i === activeIndex
          const isPast = i < activeIndex
          return (
            <div
              key={`${track.id}-${i}-${line.time}`}
              ref={isActive ? activeRef : null}
              className={`line ${isActive ? 'active' : ''} ${isPast ? 'past' : ''}`}
            >
              <div className="words">
                {isActive && activeWords.length ? (
                  activeWords.map((w, wi) => (
                    <span key={wi} className={wi <= activeWord ? 'w-active' : ''}>{w.text}{' '}</span>
                  ))
                ) : (
                  line.text
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
