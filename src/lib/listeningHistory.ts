import type { Track } from '../types'

export type HistoryEntry = {
  id: string
  trackId: string
  title: string
  artist: string
  album: string
  cover: string
  source: Track['source']
  spotifyUri?: string
  youtubeId?: string
  externalUrl?: string
  startedAt: number
  lastObservedAt: number
  seconds: number
  genre?: string
}

const KEY = 'lf-listening-history-v1'

export function loadListeningHistory(): HistoryEntry[] {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(saved) ? saved.filter((item) => typeof item?.startedAt === 'number' && typeof item?.title === 'string').slice(-500) : []
  } catch { return [] }
}

export function saveListeningHistory(entries: HistoryEntry[]) {
  try { localStorage.setItem(KEY, JSON.stringify(entries.slice(-500))) } catch { /* keep session active */ }
}

export function clearListeningHistory() { localStorage.removeItem(KEY) }

export function observeListening(entries: HistoryEntry[], track: Track, seconds: number, now: number): HistoryEntry[] {
  const last = entries[entries.length - 1]
  if (last?.trackId === track.id && now - (last.lastObservedAt || last.startedAt) < 30_000) {
    return [...entries.slice(0, -1), { ...last, lastObservedAt: now, seconds: last.seconds + seconds }]
  }
  const genre = track.tags.find((tag) => tag.startsWith('genre:'))?.slice(6)
  return [...entries.slice(-499), {
    id: `${now}-${track.id}`,
    trackId: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    cover: track.cover,
    source: track.source,
    spotifyUri: track.spotifyUri,
    youtubeId: track.youtubeId,
    externalUrl: track.externalUrl,
    startedAt: now,
    lastObservedAt: now,
    seconds,
    genre,
  }]
}
