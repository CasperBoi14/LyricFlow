import { BadRequestError, NotFoundError, UpstreamError } from '../lib/errors.js'
import { fetchWithTimeout } from '../lib/fetch.js'

const LRCLIB_API = 'https://lrclib.net/api'
const LYRICS_TIMEOUT_MS = 10_000
const MAX_QUERY_LENGTH = 300
const LRCLIB_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'LyricFlow/1.0 (https://github.com/casperboi14/LyricFlow)',
}

export type LyricsRecord = Record<string, unknown>

export type LyricsGetParams = {
  id?: string
  artist_name?: string
  track_name?: string
  album_name?: string
  duration?: number
}

export async function searchLyrics(query: string): Promise<LyricsRecord[]> {
  const searchQuery = query.trim()
  if (!searchQuery) throw new BadRequestError('Missing query')
  if (searchQuery.length > MAX_QUERY_LENGTH) throw new BadRequestError('Query is too long')

  const url = new URL(`${LRCLIB_API}/search`)
  url.searchParams.set('q', searchQuery)

  const response = await fetchWithTimeout(url, { headers: LRCLIB_HEADERS }, LYRICS_TIMEOUT_MS)
  if (response.status === 404) return []
  if (!response.ok) {
    throw new UpstreamError(`Lyrics search failed (${response.status})`)
  }

  const data: unknown = await response.json().catch(() => null)
  if (!Array.isArray(data)) {
    throw new UpstreamError('Lyrics search returned an invalid response')
  }

  return data as LyricsRecord[]
}

export async function getLyrics(params: LyricsGetParams): Promise<LyricsRecord> {
  const id = params.id?.trim() ?? ''
  const artistName = params.artist_name?.trim() ?? ''
  const trackName = params.track_name?.trim() ?? ''
  const albumName = params.album_name?.trim() ?? ''

  if (id) {
    if (!/^\d{1,20}$/.test(id)) throw new BadRequestError('id must be a numeric LRCLIB identifier')
  } else if (!artistName || !trackName) {
    throw new BadRequestError('artist_name and track_name are required')
  }

  if (artistName.length > MAX_QUERY_LENGTH || trackName.length > MAX_QUERY_LENGTH) {
    throw new BadRequestError('Query is too long')
  }
  if (albumName.length > MAX_QUERY_LENGTH) throw new BadRequestError('Query is too long')

  let url: URL
  if (id) {
    url = new URL(`${LRCLIB_API}/get/${id}`)
  } else {
    url = new URL(`${LRCLIB_API}/get`)
    url.searchParams.set('artist_name', artistName)
    url.searchParams.set('track_name', trackName)
    if (albumName) url.searchParams.set('album_name', albumName)
    if (params.duration !== undefined) {
      if (!Number.isInteger(params.duration) || params.duration <= 0) {
        throw new BadRequestError('duration must be a positive number of seconds')
      }
      url.searchParams.set('duration', String(params.duration))
    }
  }

  const response = await fetchWithTimeout(url, { headers: LRCLIB_HEADERS }, LYRICS_TIMEOUT_MS)
  if (response.status === 404) {
    throw new NotFoundError('Lyrics not found')
  }
  if (!response.ok) {
    throw new UpstreamError(`Lyrics lookup failed (${response.status})`)
  }

  const data: unknown = await response.json().catch(() => null)
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new UpstreamError('Lyrics lookup returned an invalid response')
  }

  return data as LyricsRecord
}
