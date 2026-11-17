import { BadRequestError, UpstreamError } from '../lib/errors.js'
import { fetchWithTimeout } from '../lib/fetch.js'

const ITUNES_SEARCH_URL = 'https://itunes.apple.com/search'
const SEARCH_TIMEOUT_MS = 10_000
const MAX_QUERY_LENGTH = 300

type ITunesTrack = {
  trackId?: number
  collectionId?: number
  trackName?: string
  artistName?: string
  collectionName?: string
  trackTimeMillis?: number
  artworkUrl100?: string
  artworkUrl60?: string
  previewUrl?: string
  trackViewUrl?: string
}

type ITunesSearchResponse = {
  results?: ITunesTrack[]
}

export type MusicSearchResult = {
  id: number | string
  title: string
  artist: string
  album: string
  duration: number
  cover: string
  previewUrl: string
  externalUrl: string
  source: 'itunes'
}

export type MusicSearchResponse = {
  results: MusicSearchResult[]
}

function normalizeTrack(track: ITunesTrack): MusicSearchResult | null {
  const title = track.trackName?.trim()
  const artist = track.artistName?.trim()
  if (!title || !artist) return null

  const artwork = track.artworkUrl100 ?? track.artworkUrl60

  return {
    id: track.trackId ?? track.collectionId ?? `${title}-${artist}`,
    title,
    artist,
    album: track.collectionName ?? 'Single',
    duration: Math.round(Number(track.trackTimeMillis) / 1000) || 0,
    cover: artwork ? artwork.replace('100x100bb', '400x400bb') : '',
    previewUrl: track.previewUrl ?? '',
    externalUrl: track.trackViewUrl ?? '',
    source: 'itunes',
  }
}

export async function searchMusic(query: string): Promise<MusicSearchResponse> {
  const searchQuery = query.trim()
  if (!searchQuery) throw new BadRequestError('Missing query')
  if (searchQuery.length > MAX_QUERY_LENGTH) throw new BadRequestError('Query is too long')

  const url = new URL(ITUNES_SEARCH_URL)
  url.searchParams.set('term', searchQuery)
  url.searchParams.set('media', 'music')
  url.searchParams.set('entity', 'song')
  url.searchParams.set('limit', '20')

  const response = await fetchWithTimeout(url, {}, SEARCH_TIMEOUT_MS)
  if (!response.ok) {
    throw new UpstreamError(`Music search failed (${response.status})`)
  }

  const data: unknown = await response.json().catch(() => null)
  if (!data || typeof data !== 'object') {
    throw new UpstreamError('Music search returned an invalid response')
  }

  const rows = (data as ITunesSearchResponse).results
  const results = Array.isArray(rows)
    ? rows.map(normalizeTrack).filter((item): item is MusicSearchResult => item !== null)
    : []

  return { results }
}
