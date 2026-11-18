import type { SearchResult } from '../types'

export type Artist = {
  id: number
  name: string
  url: string
  genre: string
}

export type ArtistDetails = {
  songs: SearchResult[]
  image: string
  imageSource: 'photo' | 'artwork' | 'none'
}

type ItunesRow = {
  wrapperType?: string
  kind?: string
  artistId?: number
  artistName?: string
  artistLinkUrl?: string
  primaryGenreName?: string
  trackId?: number
  trackName?: string
  collectionName?: string
  trackTimeMillis?: number
  artworkUrl100?: string
  trackViewUrl?: string
}

async function itunes(url: URL): Promise<ItunesRow[]> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error('Artist search is unavailable right now.')
  const data = await res.json() as { results?: ItunesRow[] }
  return Array.isArray(data.results) ? data.results : []
}

export async function searchArtists(query: string): Promise<Artist[]> {
  const url = new URL('https://itunes.apple.com/search')
  url.searchParams.set('term', query.trim())
  url.searchParams.set('entity', 'musicArtist')
  url.searchParams.set('attribute', 'artistTerm')
  url.searchParams.set('limit', '8')
  const rows = await itunes(url)
  return rows.filter((row) => row.wrapperType === 'artist' && row.artistId && row.artistName)
    .map((row) => ({ id: row.artistId!, name: row.artistName!, url: row.artistLinkUrl || '', genre: row.primaryGenreName || '' }))
}

async function wikipediaPhoto(name: string): Promise<string> {
  try {
    const url = new URL('https://en.wikipedia.org/w/api.php')
    url.searchParams.set('action', 'query')
    url.searchParams.set('titles', name)
    url.searchParams.set('prop', 'pageimages')
    url.searchParams.set('format', 'json')
    url.searchParams.set('pithumbsize', '800')
    url.searchParams.set('origin', '*')
    const res = await fetch(url, { signal: AbortSignal.timeout(6_000) })
    if (!res.ok) return ''
    const data = await res.json() as { query?: { pages?: Record<string, { thumbnail?: { source?: string } }> } }
    return Object.values(data.query?.pages || {})[0]?.thumbnail?.source || ''
  } catch { return '' }
}

export async function getArtistDetails(artist: Artist): Promise<ArtistDetails> {
  const url = new URL('https://itunes.apple.com/lookup')
  url.searchParams.set('id', String(artist.id))
  url.searchParams.set('entity', 'song')
  url.searchParams.set('limit', '50')
  const [rows, photo] = await Promise.all([itunes(url), wikipediaPhoto(artist.name)])
  const seen = new Set<string>()
  const songs = rows.filter((row) => row.wrapperType === 'track' && row.kind === 'song' && row.trackName)
    .map((row): SearchResult => ({
      id: `artist-${artist.id}-${row.trackId || row.trackName}`,
      title: row.trackName!,
      artist: row.artistName || artist.name,
      album: row.collectionName || 'Single',
      duration: Math.round((row.trackTimeMillis || 0) / 1000),
      cover: (row.artworkUrl100 || '').replace('100x100bb', '600x600bb'),
      source: 'search',
      externalUrl: row.trackViewUrl,
    }))
    .filter((song) => {
      const key = `${song.title.toLowerCase()}|${song.album.toLowerCase()}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  const artwork = songs.find((song) => song.cover)?.cover || ''
  return { songs, image: photo || artwork, imageSource: photo ? 'photo' : artwork ? 'artwork' : 'none' }
}
