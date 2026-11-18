import type { SearchResult, Track } from '../types'
import { apiUrl, hasBackend } from './api'

type SearchRow = {
  id?: string | number
  trackId?: number
  title?: string
  trackName?: string
  artist?: string
  artistName?: string
  album?: string
  collectionName?: string
  duration?: number
  trackTimeMillis?: number
  cover?: string
  artworkUrl100?: string
  source?: Track['source']
  spotifyUri?: string
  externalUrl?: string
  trackViewUrl?: string
}

function normalize(row: SearchRow): SearchResult | null {
  const title = row.title || row.trackName || ''
  const artist = row.artist || row.artistName || ''
  if (!title || !artist) return null
  const rawId = row.id ?? row.trackId
  return {
    id: rawId != null ? `search-${rawId}` : `search-${title}-${artist}`.replace(/\s+/g, '-').toLowerCase(),
    title,
    artist,
    album: row.album || row.collectionName || 'Single',
    duration: Math.round(Number(row.duration ?? (row.trackTimeMillis || 0) / 1000) || 0),
    cover: (row.cover || row.artworkUrl100 || '').replace('100x100bb', '400x400bb'),
    source: row.source || 'search',
    spotifyUri: row.spotifyUri,
    externalUrl: row.externalUrl || row.trackViewUrl,
  }
}

function rowsFrom(data: unknown): SearchRow[] {
  if (Array.isArray(data)) return data as SearchRow[]
  if (data && typeof data === 'object' && Array.isArray((data as { results?: unknown }).results)) {
    return (data as { results: SearchRow[] }).results
  }
  return []
}

async function directSearch(query: string): Promise<SearchResult[]> {
  const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=20`)
  if (!res.ok) throw new Error('Music search failed')
  return rowsFrom(await res.json()).map(normalize).filter((r): r is SearchResult => !!r)
}

export async function searchMusic(query: string): Promise<SearchResult[]> {
  const q = query.trim()
  if (!q) return []

  if (hasBackend) {
    try {
      const res = await fetch(apiUrl(`/api/music/search?q=${encodeURIComponent(q)}`))
      if (res.ok) {
        const mapped = rowsFrom(await res.json()).map(normalize).filter((r): r is SearchResult => !!r)
        if (mapped.length) return mapped
      }
    } catch { /* fall back to the public iTunes API */ }
  }

  return directSearch(q)
}
