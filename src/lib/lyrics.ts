import type { LyricLine, TimedWord } from '../types'

export function getActiveLineIndex(lyrics: LyricLine[], time: number): number {
  if (lyrics.length === 0) return -1
  let lo = 0
  let hi = lyrics.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lyrics[mid].time <= time) {
      ans = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return ans
}

export function wordIndexAt(words: TimedWord[] | undefined, time: number): number {
  if (!words?.length) return -1
  let lo = 0
  let hi = words.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (words[mid].t <= time) {
      ans = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return ans
}

export function getActiveWordIndex(line: LyricLine | undefined, time: number): number {
  return wordIndexAt(line?.words, time)
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** Positive offsets show each lyric and word later than the audio. */
export function lyricTime(currentTime: number, delayMs: number): number {
  return currentTime - delayMs / 1000
}

const VOWELS = /[aeiouy]+/g

function syllables(raw: string): number {
  const w = raw.toLowerCase().replace(/[^a-z']/g, '').replace(/'/g, '')
  if (!w) return 1
  const groups = w.match(VOWELS)
  let n = groups ? groups.length : 1
  if (n > 1 && w.endsWith('e') && !w.endsWith('ee') && !w.endsWith('le')) n -= 1
  return Math.max(1, n)
}

function pauseWeight(word: string): number {
  if (/[.!?…]["')\]]?$/.test(word)) return 0.85
  if (/[,;:]["')\]]?$/.test(word)) return 0.42
  if (/[—–-]$/.test(word)) return 0.3
  return 0
}

function wordWeight(word: string): number {
  const letters = word.replace(/[^\p{L}\p{N}]/gu, '').length
  return syllables(word) * 0.55 + Math.min(3.5, letters) * 0.12 + pauseWeight(word) + 0.18
}

function round3(n: number) { return Math.round(n * 1000) / 1000 }

/**
 * Produces word timings for a line. Uses real enhanced-LRC word tags when
 * present, otherwise distributes time by syllable weight + punctuation pauses
 * and leaves a short breath before the next line.
 */
export function buildWordTimings(line: LyricLine | null | undefined, next?: LyricLine | null): TimedWord[] {
  if (!line) return []
  if (line.words?.length) {
    const sorted = [...line.words].sort((a, b) => a.t - b.t)
    return sorted.map(w => ({ t: w.t, text: w.text }))
  }
  const parts = line.text.split(/\s+/).filter(Boolean)
  if (!parts.length) return []

  const natural = parts.reduce((n, p) => n + syllables(p) * 0.3 + 0.22, 0)
  const rawEnd = next ? next.time : line.time + Math.min(14, Math.max(2.2, natural))
  const breath = next ? Math.min(0.75, Math.max(0.14, (rawEnd - line.time) * 0.12)) : 0
  const end = Math.max(line.time + 0.8, rawEnd - breath)
  const span = Math.max(0.5, end - line.time)

  const weights = parts.map(wordWeight)
  const total = weights.reduce((a, b) => a + b, 0) || 1

  let cursor = line.time
  return parts.map((text, i) => {
    const at = round3(cursor)
    cursor += (weights[i] / total) * span
    return { t: at, text }
  })
}

export function parseLrc(input: string): LyricLine[] {
  const rows = input.split(/\r?\n/)
  const out: LyricLine[] = []
  const lineTag = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g
  const wordTag = /<(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?>/g

  for (const raw of rows) {
    const textPart = raw.replace(lineTag, '')
    const words = parseEnhancedWords(textPart, wordTag)
    const plain = textPart.replace(wordTag, '').replace(/\s+/g, ' ').trim()
    let m: RegExpExecArray | null
    lineTag.lastIndex = 0
    while ((m = lineTag.exec(raw))) {
      const time = toSeconds(m[1], m[2], m[3])
      out.push({ time: round3(time), text: plain || '♪', ...(words.length ? { words } : {}) })
    }
  }
  return out.sort((a, b) => a.time - b.time)
}

function toSeconds(min: string, sec: string, frac?: string) {
  const ms = Number((frac || '0').padEnd(3, '0'))
  return Number(min) * 60 + Number(sec) + ms / 1000
}

function parseEnhancedWords(text: string, re: RegExp): TimedWord[] {
  const marks: { t: number; start: number; end: number }[] = []
  re.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    marks.push({ t: toSeconds(m[1], m[2], m[3]), start: m.index, end: m.index + m[0].length })
  }
  if (!marks.length) return []

  const words: TimedWord[] = []
  const leading = text.slice(0, marks[0].start).trim()
  if (leading) words.push({ t: round3(marks[0].t), text: leading })

  for (let i = 0; i < marks.length; i++) {
    const stop = i + 1 < marks.length ? marks[i + 1].start : text.length
    const text2 = text.slice(marks[i].end, stop).trim()
    if (text2) words.push({ t: round3(marks[i].t), text: text2 })
  }
  return words
}

export function ensureTimedLyrics(lyrics: LyricLine[], duration: number, knownSynced?: boolean): { lyrics: LyricLine[]; simulated: boolean } {
  if (!lyrics.length) return { lyrics: [{ time: 0, text: 'No lyrics available.' }], simulated: false }
  const times = lyrics.map(l => l.time)
  const unique = new Set(times)
  const detected = unique.size > 3 && (lyrics.length > 1 && times[times.length - 1] - times[0] > 10)
  const alreadySynced = knownSynced === undefined ? detected : knownSynced && detected
  if (alreadySynced) return { lyrics, simulated: false }
  const usable = Math.max(duration - 6, lyrics.length * 2.5, 30)
  const step = usable / Math.max(lyrics.length, 1)
  return { lyrics: lyrics.map((l, i) => ({ ...l, time: round3(i * step) })), simulated: true }
}
