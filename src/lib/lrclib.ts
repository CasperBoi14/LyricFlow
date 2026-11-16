import type { LyricLine, Track, SearchResult } from '../types'
import { parseLrc } from './lyrics'

const API = import.meta.env.DEV ? '/api/lyrics' : 'https://lrclib.net/api'

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
    youtubeId: base.youtubeId,
    spotifyUri: base.spotifyUri,
    synced,
    instrumental,
  }
}

export async function searchLyrics(query: string): Promise<SearchResult[]> {
  const q = query.trim()
  if (!q) return []
  const res = await fetch(`${API}/search?q=${encodeURIComponent(q)}`)
  if (!res.ok) throw new Error('Lyrics search failed')
  const data = await res.json() as any[]
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
  let res = await fetch(`${API}/get?${params.toString()}`)
  if (!res.ok) {
    const sr = await fetch(`${API}/search?q=${encodeURIComponent(artist + ' ' + title)}`)
    if (!sr.ok) throw new Error('Lyrics not found')
    const arr = await sr.json() as any[]
    const best = arr?.[0]
    if (!best) throw new Error('Lyrics not found')
    return fromRecord(best)
  }
  return fromRecord(await res.json())
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

export async function resolveToTrack(base: { id: string; title: string; artist: string; album?: string; duration?: number; cover?: string; source: Track['source']; youtubeId?: string; spotifyUri?: string; externalUrl?: string; tags?: string[] }): Promise<Track> {
  try {
    const got = await getLyricsFor(base.artist, base.title, base.album, base.duration)
    return toTrack({ ...base, album: got.albumName || base.album }, got.lyrics, got.duration || base.duration || 0, got.synced, got.instrumental)
  } catch {
    return toTrack(base, [{ time: 0, text: 'Lyrics not found on the web for this track.' }, { time: 5, text: 'Try another search or check the artist/title.' }], base.duration || 0, false)
  }
}
