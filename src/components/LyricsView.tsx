import { useEffect, useMemo, useRef } from 'react'
import type { LyricLine, Track } from '../types'
import type { Playlist } from '../lib/playlists'
import { buildWordTimings, ensureTimedLyrics, getActiveLineIndex, lyricTime, wordIndexAt } from '../lib/lyrics'
import { AddToPlaylist } from './AddToPlaylist'

type Props = {
  track: Track | null
  currentTime: number
  duration: number
  delayMs: number
  onOpenFullscreen: () => void
  playlists: Playlist[]
  onAdd: (playlistId: string, trackId: string) => void
  onCreate: (name: string) => Playlist
}

export function LyricsView({ track, currentTime, duration, delayMs, onOpenFullscreen, playlists, onAdd, onCreate }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const activeRef = useRef<HTMLDivElement | null>(null)

  const timed = useMemo(() => track ? ensureTimedLyrics(track.lyrics, duration || track.duration, track.synced) : { lyrics: [] as LyricLine[], simulated: false }, [track, duration])
  const lyrics = timed.lyrics
  const t = lyricTime(currentTime, delayMs)
  const activeIndex = useMemo(() => getActiveLineIndex(lyrics, t), [lyrics, t])
  const activeLine = activeIndex >= 0 ? lyrics[activeIndex] : undefined
  const activeWords = useMemo(() => activeLine ? buildWordTimings(activeLine, lyrics[activeIndex + 1]) : [], [activeLine, lyrics, activeIndex])
  const activeWord = wordIndexAt(activeWords, t)

  useEffect(() => {
    if (activeRef.current && containerRef.current) {
      activeRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [activeIndex, track?.id])

  if (!track) return <div className="lyrics-empty">
    <span className="lyrics-empty-mark" aria-hidden="true">♪</span>
    <h2>Lyrics live here</h2>
    <p>Choose a song to follow its words as the music plays.</p>
  </div>

  return (
    <div className="lyrics-pane">
      <div className="lyrics-header">
        <div className="section-title">Lyrics</div>
        <div className="row">
          <AddToPlaylist playlists={playlists} track={track} onAdd={onAdd} onCreate={onCreate} placement="down" />
          <button className="btn small" onClick={onOpenFullscreen}>⛶ Fullscreen</button>
        </div>
      </div>
      <div className="lyrics-scroll" ref={containerRef}>
        {timed.simulated ? <div className="muted small lyric-accuracy">No synced lyrics available. Line timing is estimated.</div>
          : activeLine && !activeLine.words?.length && <div className="muted small lyric-accuracy">Word timing is estimated between synced lines.</div>}
        {lyrics.map((line: LyricLine, i) => {
          const isActive = i === activeIndex
          const isPast = i < activeIndex
          return (
            <div
              key={`${track.id}-${i}-${line.time}`}
              ref={isActive ? activeRef : null}
              className={`line ${isActive ? 'active' : ''} ${isPast ? 'past' : ''} ${i > activeIndex ? 'upcoming' : ''}`}
            >
              <div className="words">
                {isActive && activeWords.length ? (
                  activeWords.map((w, wi) => (
                    <span key={`${track.id}-${i}-${wi}`} className={`lyric-word${wi === activeWord ? ' current' : wi < activeWord ? ' sung' : ' upcoming'}`}>{w.text}</span>
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
