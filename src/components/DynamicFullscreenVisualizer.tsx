import { Fragment, memo, useLayoutEffect, useMemo, useRef, type CSSProperties } from 'react'
import { buildWordTimings, ensureTimedLyrics, getActiveLineIndex, lyricTime, wordIndexAt } from '../lib/lyrics'
import type { LyricLine, Track } from '../types'
import './DynamicFullscreenVisualizer.css'

type Props = {
  track: Track
  currentTime: number
  duration: number
  delayMs: number
  playing: boolean
  onOpenSettings: () => void
}

type Cue = LyricLine & { tokens: string[]; enter: number; exit: number }

const EXIT_DURATION = .28
const unit = (progress: number) => Math.max(0, Math.min(1, progress))

function buildCues(lyrics: LyricLine[]): Cue[] {
  const phrases = lyrics.flatMap((line) => {
    if (!line.words?.length) return [line]
    const words = buildWordTimings(line)
    if (words.length <= 8) return [{ ...line, words }]

    // Use the actual word boundaries to break long timed lines into short phrases.
    const size = Math.ceil(words.length / Math.ceil(words.length / 6))
    const phrases: LyricLine[] = []
    for (let start = 0; start < words.length; start += size) {
      const phrase = words.slice(start, start + size)
      phrases.push({ time: start === 0 ? line.time : phrase[0].t, text: phrase.map((word) => word.text).join(' '), words: phrase })
    }
    return phrases
  }).sort((a, b) => a.time - b.time)

  return phrases.map((line, index) => {
    const tokens = line.words?.map((word) => word.text) ?? line.text.split(/\s+/).filter(Boolean)
    const nextTime = phrases[index + 1]?.time ?? Infinity
    const hold = Math.min(8.5, Math.max(5, tokens.length * .47 + 1.8))
    const cutoff = Math.max(line.time + hold, (line.words?.at(-1)?.t ?? line.time) + .7)
    const exit = nextTime <= cutoff ? nextTime : cutoff - EXIT_DURATION
    const enter = Math.max(.001, Math.min(.42, (exit - line.time) * .64))
    return { ...line, tokens, enter, exit }
  })
}

// Rasterize a small grain tile once, then let CSS repeat it over the light.
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

const DynamicCue = memo(function DynamicCue({ cue, index, intro, outro, wordIndex, outgoing }: {
  cue: Cue
  index: number
  intro: number
  outro: number
  wordIndex: number
  outgoing: boolean
}) {
  const ref = useRef<HTMLParagraphElement>(null)

  useLayoutEffect(() => {
    const element = ref.current
    const stage = element?.parentElement
    if (!element || !stage) return
    const rows = Math.min(5, Math.max(2, Math.ceil(cue.text.trim().split(/\s+/).length / 3)))
    let lastWidth = 0
    let lastHeight = 0
    const fit = (fontChanged = false) => {
      const { clientWidth: width, clientHeight: height } = stage
      if (!width || !height || (!fontChanged && width === lastWidth && height === lastHeight)) return
      lastWidth = width
      lastHeight = height
      // Measure the real balanced wrapping, including fallback fonts.
      let low = 1
      let high = Math.max(low, Math.floor(Math.min(width * .64, height * .76)))
      while (low < high) {
        const size = Math.ceil((low + high) / 2)
        element.style.fontSize = `${size}px`
        const maxHeight = Math.min(height, size * (rows * .87 + .24) + 1)
        if (element.scrollWidth <= width && element.offsetHeight <= maxHeight) low = size
        else high = size - 1
      }
      element.style.fontSize = `${low}px`
    }
    const observer = new ResizeObserver(() => fit())
    observer.observe(stage)
    fit()
    let open = true
    if (document.fonts.status === 'loading') document.fonts.ready.then(() => {
      if (open) fit(true)
    })
    return () => {
      open = false
      observer.disconnect()
    }
  }, [cue])

  const positions = [[0, 0], [-1, 2.6], [1, -2.3], [0, 1.3]]
  const [x, y] = positions[index % positions.length]
  const easeIn = 1 - (1 - intro) ** 3
  const easeOut = 1 - (1 - outro) ** 2
  const style = {
    '--cue-x': `${x}%`,
    '--cue-y': `${y}%`,
    '--intro': intro,
    '--opacity': (.18 + .82 * easeIn) * (1 - easeOut),
    '--lift': `${.16 * (1 - easeIn) - .13 * easeOut}em`,
    '--scale': 1 - .06 * (1 - easeIn) - .045 * easeOut,
  } as CSSProperties

  return (
    <p ref={ref} className={`dynamic-cue${cue.words ? ' has-word-timing' : ''}`} style={style} aria-hidden={outgoing || undefined} dir="auto">
      {cue.tokens.map((word, offset) => (
        <Fragment key={offset}>
          {offset > 0 && ' '}
          <span
            className={`dynamic-token${offset === wordIndex ? ' is-current' : offset < wordIndex ? ' is-sung' : ''}`}
            style={{ '--stagger': Math.min(offset * .035, .28) } as CSSProperties}
          >{word}</span>
        </Fragment>
      ))}
    </p>
  )
})

export function DynamicFullscreenVisualizer({ track, currentTime, duration, delayMs, playing, onOpenSettings }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const grainRef = useRef<HTMLDivElement>(null)
  const total = duration || track.duration
  const lyrics = useMemo(() => {
    if (track.instrumental) return []
    if (track.lyrics.length && (track.synced || track.lyrics.some((line) => line.words?.length))) return track.lyrics
    return ensureTimedLyrics(track.lyrics, total, track.synced).lyrics
  }, [track, total])
  const cues = useMemo(() => buildCues(lyrics), [lyrics])
  const time = lyricTime(currentTime, delayMs)
  const index = getActiveLineIndex(cues, time)
  const active = cues[index]
  const previous = cues[index - 1]
  const history = useRef<{ cues: Cue[]; time: number; index: number; outgoing: number; settled: boolean } | null>(null)

  useLayoutEffect(() => {
    if (grainRef.current) grainRef.current.style.backgroundImage = getGrainImage() ?? ''
    if (!document.querySelector('dialog[open]')) rootRef.current?.focus({ preventScroll: true })
  }, [])

  useLayoutEffect(() => {
    const last = history.current
    const continuous = last?.cues === cues && time >= last.time && time - last.time < .55
    const sameCue = last?.cues === cues && last.index === index
    const settled = Boolean((sameCue && last.settled) || (!playing && (!continuous || !sameCue)))
    let outgoing = -1
    if (continuous && last.index === index) outgoing = last.outgoing
    else if (continuous && playing && last.index === index - 1) outgoing = last.index
    history.current = { cues, time, index, outgoing, settled }
    stageRef.current?.toggleAttribute('data-overlap', outgoing >= 0 && outgoing === index - 1)
    // A cue first shown while paused should already be legible when the user resumes.
    stageRef.current?.toggleAttribute('data-settled', Boolean(settled && active && time < active.time + active.enter))
  }, [active, cues, index, time, playing])

  const renderCue = (cue: Cue, cueIndex: number, outgoing: boolean) => (
    <DynamicCue
      key={cueIndex}
      cue={cue}
      index={cueIndex}
      intro={unit((time - cue.time) / cue.enter)}
      outro={unit((time - cue.exit) / EXIT_DURATION)}
      wordIndex={wordIndexAt(cue.words, Math.min(time, cue.exit))}
      outgoing={outgoing}
    />
  )

  return (
    <div ref={rootRef} className={`dynamic-stage${playing ? ' is-playing' : ''}`} role="region" aria-label="Fullscreen lyrics" tabIndex={-1}>
      <div className="dynamic-ambient" aria-hidden="true" />
      <div ref={grainRef} className="dynamic-grain" aria-hidden="true" />
      <div ref={stageRef} className="dynamic-lyrics">
        {previous && time < previous.exit + EXIT_DURATION && renderCue(previous, index - 1, true)}
        {active && time < active.exit + EXIT_DURATION && renderCue(active, index, false)}
      </div>
      <button className="dynamic-settings-trigger" type="button" aria-label="Open settings" aria-haspopup="dialog" onClick={onOpenSettings} />
    </div>
  )
}
