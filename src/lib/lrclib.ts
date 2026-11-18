import type { LyricLine, Track, SearchResult } from '../types'
import { parseLrc } from './lyrics'
import { apiUrl, hasBackend } from './api'

const DIRECT_API = 'https://lrclib.net/api'

function coverFor(seed: string) {
  const hues = [200, 260, 330, 160, 20, 45]
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h + seed.charCodeAt(i)) % hues.length
  const a = hues[h], b = hues[(h + 2) % hues.length]
  return `linear-gradient(135deg,hsl(${a} 80% 55%),hsl(${b} 70% 35%))`
}

function toTrack(base: Partial<Track> & { title: string; artist: string; id: string; source: Track['source'] }, lyrics: LyricLine[], duration: number, synced: boolean, instrumental = false): Track {
  return {
    id: base.id,
    title: base.title,
    artist: base.artist,
    album: base.album || 'Single',
    duration: duration || (lyrics.length ? lyrics[lyrics.length - 1].time + 8 : 180),
    cover: base.cover || coverFor(base.title + base.artist),
    tags: [base.source, synced ? 'synced' : 'plain', ...(base.tags || [])],
    lyrics: lyrics.length ? lyrics : [{ time: 0, text: 'No lyrics found for this track.' }],
    source: base.source,
    externalUrl: base.externalUrl,
    spotifyUri: base.spotifyUri,
    synced,
    instrumental,
  }
}

async function searchRecords(query: string): Promise<any[]> {
  if (hasBackend) {
    try {
      const res = await fetch(apiUrl(`/api/lyrics/search?q=${encodeURIComponent(query)}`))
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data)) return data
      }
    } catch { /* fall back to LRCLIB directly */ }
  }
  const res = await fetch(`${DIRECT_API}/search?q=${encodeURIComponent(query)}`)
  if (!res.ok) throw new Error('Lyrics search failed')
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

async function getRecord(params: URLSearchParams): Promise<any | null> {
  if (hasBackend) {
    try {
      const res = await fetch(apiUrl(`/api/lyrics/get?${params.toString()}`))
      if (res.ok) return await res.json()
    } catch { /* fall back to LRCLIB directly */ }
  }
  const res = await fetch(`${DIRECT_API}/get?${params.toString()}`)
  if (!res.ok) return null
  return await res.json().catch(() => null)
}

export async function searchLyrics(query: string): Promise<SearchResult[]> {
  const q = query.trim()
  if (!q) return []
  const data = await searchRecords(q)
  return (data || []).slice(0, 20).map((r) => ({
    id: `lrclib-${r.id}`,
    title: r.trackName || r.name || 'Unknown',
    artist: r.artistName || 'Unknown Artist',
    album: r.albumName || 'Single',
    duration: Number(r.duration) || 0,
    cover: coverFor((r.trackName || '') + (r.artistName || '')),
    source: 'search' as const,
  }))
}

export async function getLyricsFor(artist: string, title: string, album = '', durationSec?: number): Promise<{ lyrics: LyricLine[]; synced: boolean; instrumental: boolean; duration: number; albumName?: string }> {
  const params = new URLSearchParams({ artist_name: artist, track_name: title })
  if (album) params.set('album_name', album)
  if (durationSec) params.set('duration', String(Math.round(durationSec)))
  const exact = await getRecord(params)
  if (exact) return fromRecord(exact)
  const arr = await searchRecords(`${artist} ${title}`)
  const best = arr?.[0]
  if (!best) throw new Error('Lyrics not found')
  return fromRecord(best)
}

function fromRecord(r: any) {
  const instrumental = !!r.instrumental
  let lyrics: LyricLine[] = []
  let synced = false
  if (r.syncedLyrics) { lyrics = parseLrc(r.syncedLyrics); synced = lyrics.length > 0 }
  else if (r.plainLyrics) { lyrics = plainToLines(r.plainLyrics); synced = false }
  if (instrumental && !lyrics.length) lyrics = [{ time: 0, text: '♪ Instrumental' }]
  return { lyrics, synced, instrumental, duration: Number(r.duration) || 0, albumName: r.albumName }
}

export function plainToLines(plain: string): LyricLine[] {
  const rows = plain.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  if (!rows.length) return []
  const step = 4
  return rows.map((text, i) => ({ time: i * step, text }))
}

export async function resolveToTrack(base: { id: string; title: string; artist: string; album?: string; duration?: number; cover?: string; source: Track['source']; spotifyUri?: string; externalUrl?: string; tags?: string[] }): Promise<Track> {
  try {
    const got = await getLyricsFor(base.artist, base.title, base.album, base.duration)
    return toTrack({ ...base, album: got.albumName || base.album }, got.lyrics, got.duration || base.duration || 0, got.synced, got.instrumental)
  } catch {
    return toTrack(base, [{ time: 0, text: 'Lyrics not found on the web for this track.' }, { time: 5, text: 'Try another search or check the artist/title.' }], base.duration || 0, false)
  }
}
