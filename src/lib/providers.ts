import type { SearchResult } from '../types'

export async function searchMusic(query: string): Promise<SearchResult[]> {
  const q = query.trim()
  if (!q) return []
  const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=20`)
  if (!res.ok) throw new Error('Music search failed')
  const data = await res.json() as any
  return (data.results || []).map((r: any) => ({
    id: `itunes-${r.trackId}`,
    title: r.trackName,
    artist: r.artistName,
    album: r.collectionName || 'Single',
    duration: Math.round((r.trackTimeMillis || 0) / 1000),
    cover: (r.artworkUrl100 || '').replace('100x100bb', '400x400bb') || '',
    source: 'search' as const,
    externalUrl: r.trackViewUrl,
  }))
}