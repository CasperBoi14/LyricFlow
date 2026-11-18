import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Track } from '../types'
import { ensureTimedLyrics, getActiveLineIndex, lyricTime } from '../lib/lyrics'

type Props = {
  track: Track
  time: number
  delayMs: number
  playing: boolean
  position: 'top-right' | 'bottom-right'
  onTogglePlay: () => void
  onNext: () => void
  onPrevious: () => void
  onOpenFull: () => void
  onClose: () => void
}

export function FloatingLyricsWidget({ track, time, delayMs, playing, position, onTogglePlay, onNext, onPrevious, onOpenFull, onClose }: Props) {
  const [pip, setPip] = useState<Window | null>(null)
  const lyrics = useMemo(() => ensureTimedLyrics(track.lyrics, track.duration, track.synced).lyrics, [track])
  const line = lyrics[getActiveLineIndex(lyrics, lyricTime(time, delayMs))]?.text || 'Waiting for lyrics…'

  useEffect(() => () => { try { pip?.close() } catch { /* ignore */ } }, [pip])

  const popOut = async () => {
    try {
      const api = (window as any).documentPictureInPicture
      if (!api?.requestWindow) return
      const popup = await api.requestWindow({ width: 380, height: 190 }) as Window
      document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => popup.document.head.appendChild(node.cloneNode(true)))
      popup.document.body.style.margin = '0'
      popup.document.body.style.background = '#0c0e14'
      popup.addEventListener('pagehide', () => setPip(null), { once: true })
      setPip(popup)
    } catch { /* keep the in-page widget */ }
  }

  const card = <div className="floating-lyrics-card">
    <div className="floating-lyrics-top"><img src={track.cover.startsWith('http') ? track.cover : `${import.meta.env.BASE_URL}favicon.svg`} alt="" /><div><strong>{track.title}</strong><small>{track.artist}</small></div><button aria-label="Hide widget" onClick={onClose}>×</button></div>
    <p>{line}</p>
    <div className="floating-lyrics-controls"><button onClick={onPrevious} aria-label="Previous song">⏮</button><button onClick={onTogglePlay} aria-label={playing ? 'Pause' : 'Play'}>{playing ? 'Ⅱ' : '▶'}</button><button onClick={onNext} aria-label="Next song">⏭</button><button onClick={onOpenFull}>Full lyrics</button>{!pip && (window as any).documentPictureInPicture?.requestWindow && <button onClick={() => void popOut()}>Pop out</button>}</div>
  </div>

  return pip ? createPortal(card, pip.document.body) : <aside className={`floating-lyrics ${position}`} aria-label="Floating lyrics">{card}</aside>
}
