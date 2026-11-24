import { memo, useLayoutEffect, useMemo, useRef, type CSSProperties } from 'react'
import { buildWordTimings, ensureTimedLyrics, lyricTime, wordIndexAt } from '../lib/lyrics'
import type { DynamicSettings } from '../lib/dynamicSettings'
import type { LyricLine, TimedWord, Track } from '../types'
import './DynamicFullscreenVisualizer.css'

type Props = {
  track: Track
  currentTime: number
  duration: number
  delayMs: number
  playing: boolean
  settings: DynamicSettings
  onOpenSettings: () => void
}

type Cue = TimedWord & { end: number }
const unit = (value: number) => Math.max(0, Math.min(1, value))
const lerp = (from: number, to: number, progress: number) => from + (to - from) * progress

function buildCues(lyrics: LyricLine[]): Cue[] {
  return lyrics.flatMap((line, index) => {
    const next = lyrics[index + 1]
    const timed: TimedWord[] = []
    for (const word of buildWordTimings(line, next)) {
      const previous = timed.at(-1)
      if (previous?.t === word.t) previous.text += ' ' + word.text
      else timed.push({ ...word })
    }
    const last = timed.at(-1)
    if (!last) return []
    const end = Math.min(next?.time ?? Infinity, Math.max(last.t + 1.1, line.time + 3))
    // An enhanced-LRC tag may cover several words. Keep its start and divide its span.
    const words = timed.flatMap((word, i) => {
      const parts = word.text.trim().split(/\s+/).filter(Boolean)
      const span = Math.max(0, (timed[i + 1]?.t ?? end) - word.t)
      return parts.map((text, j) => ({ text, t: word.t + span * j / parts.length }))
    })
    return words.map((word, i) => ({ ...word, end: Math.min(words[i + 1]?.t ?? end, end) }))
      .filter((word) => word.end > word.t)
  }).sort((a, b) => a.t - b.t)
}

let grainImage: string | undefined
function getGrainImage() {
  if (grainImage) return grainImage
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 192
  const context = canvas.getContext('2d')
  if (!context) return
  const pixels = context.createImageData(canvas.width, canvas.height)
  for (let i = 0; i < pixels.data.length; i += 4) {
    const tone = Math.random() > .5 ? 230 : 0
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = tone
    pixels.data[i + 3] = Math.random() ** 2 * 76
  }
  context.putImageData(pixels, 0, 0)
  grainImage = `url(${canvas.toDataURL()})`
  return grainImage
}

const Word = memo(function Word({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const element = ref.current
    const stage = element?.closest<HTMLElement>('.dynamic-lyrics')
    if (!element || !stage) return
    const fit = () => {
      const size = Math.min(stage.clientHeight * .48, stage.clientWidth * .68)
      element.style.fontSize = `${size}px`
      element.style.fontSize = `${size * Math.min(1, stage.clientWidth * .76 / Math.max(1, element.offsetWidth))}px`
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(stage)
    let mounted = true
    if (document.fonts.status === 'loading') void document.fonts.ready.then(() => { if (mounted) fit() })
    return () => { mounted = false; observer.disconnect() }
  }, [text])
  return <span ref={ref} className="dynamic-word" dir="auto">{text}</span>
})

function pose(offset: number, trail: number) {
  const rank = Math.abs(offset)
  return {
    y: Math.sign(offset) * (rank === 0 ? 0 : rank === 1 ? 26 : 39),
    scale: rank === 0 ? 1 : rank === 1 ? .32 : .19,
    opacity: rank === 0 ? 1 : rank === 1 ? trail * .65 : rank === 2 ? trail * .28 : 0,
  }
}

export function DynamicFullscreenVisualizer({ track, currentTime, duration, delayMs, playing, settings, onOpenSettings }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const grainRef = useRef<HTMLDivElement>(null)
  const total = duration || track.duration
  const cues = useMemo(() => {
    if (track.instrumental || !track.lyrics.length) return []
    const timed = track.synced || track.lyrics.some((line) => line.words?.length)
    return buildCues(timed ? track.lyrics : ensureTimedLyrics(track.lyrics, total, track.synced).lyrics)
  }, [track, total])
  const time = lyricTime(currentTime, delayMs)
  const index = wordIndexAt(cues, time)
  const current = cues[index]
  const visible = current && time < current.end
  const connected = index > 0 && current.t - cues[index - 1].end < .5
  const intensity = settings.intensity / 100
  const trail = settings.trail / 100
  const direction = settings.direction === 'up' ? 1 : -1
  const moving = playing && settings.animation !== 'still' && intensity > 0
  const transition = settings.animation === 'drift' ? .4 : settings.animation === 'rush' ? .22 : .3
  const progress = visible && moving ? unit((time - current.t) / Math.min(transition, (current.end - current.t) * .92)) : 1
  const eased = 1 - (1 - progress) ** 3
  const pulse = Math.sin(progress * Math.PI) ** 2 * intensity
  const cut = visible && (!cues[index + 1] || cues[index + 1].t - current.end >= .5)
  const fade = cut && moving ? unit((current.end - time) / .22) : 1

  useLayoutEffect(() => {
    if (grainRef.current) grainRef.current.style.backgroundImage = getGrainImage() ?? ''
    if (!document.querySelector('dialog[open]')) rootRef.current?.focus({ preventScroll: true })
  }, [])

  const wordStyle = (offset: number) => {
    const rest = pose(offset, trail)
    const from = pose(offset + 1, trail)
    const move = connected ? (1 - eased) * intensity : 0
    const active = offset === 0
    const punch = active && settings.animation === 'impact' ? pulse : 0
    const sweep = active && settings.animation === 'rush' ? pulse : 0
    const y = lerp(rest.y, from.y, move) * direction
    const scale = lerp(rest.scale, from.scale, move * (active ? .7 : 1)) * (1 + .5 * punch)
    return {
      '--rest-position': `translateY(${rest.y * direction}vh) scale(${rest.scale})`,
      '--rest-opacity': rest.opacity,
      '--position': `translate3d(${sweep * (index % 2 ? -15 : 15)}vw, ${y}vh, 0) scale(${scale}) rotate(${sweep * (index % 2 ? -14 : 14)}deg) skewX(${sweep * -17}deg)`,
      '--opacity': fade * (offset === -1 ? Math.min(.64, lerp(rest.opacity, from.opacity, move)) : active ? 1 : lerp(rest.opacity, from.opacity, move)),
      '--burst': `${punch * .095}em`,
    } as CSSProperties
  }

  return (
    <div ref={rootRef} className={`dynamic-stage${moving ? ' is-playing' : ''}`} style={{ '--word-color': settings.wordColor, '--light-color': settings.lightColor } as CSSProperties} role="region" aria-label="Fullscreen lyrics" tabIndex={-1}>
      <div className="dynamic-ambient" aria-hidden="true" />
      <div ref={grainRef} className="dynamic-grain" aria-hidden="true" />
      <div className="dynamic-lyrics">
        {visible && [-2, -1, 0, 1, 2].map((offset) => {
          const cue = cues[index + offset]
          if (!cue || (offset < 0 && current.t - cue.end > 2.5) || (offset > 0 && cue.t - current.end > 2.5) || (offset !== 0 && !trail)) return null
          return <div key={index + offset} className={`dynamic-word-slot${offset === 0 ? ' is-current' : ''}`} style={wordStyle(offset)} aria-hidden={offset !== 0 || undefined}><Word text={cue.text} /></div>
        })}
      </div>
      <button className="dynamic-settings-trigger" type="button" aria-label="Open settings" aria-haspopup="dialog" onClick={onOpenSettings} />
    </div>
  )
}
