const LRCLIB_API = 'https://lrclib.net/api'
const DEFAULT_TIMEOUT_MS = 10_000
const MAX_QUERY_LENGTH = 300
const MAX_ID_LENGTH = 20

const LRCLIB_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'LyricFlow/1.0 (https://github.com/casperboi14/LyricFlow)',
}

export class LyricsError extends Error {
  constructor(statusCode, message) {
    super(message)
    this.name = 'LyricsError'
    this.statusCode = statusCode
  }
}

function toLyricsError(error, fallbackMessage) {
  if (error instanceof LyricsError) return error
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return new LyricsError(504, 'Lyrics provider timed out')
  }
  return new LyricsError(502, fallbackMessage)
}

async function requestJson(url, timeoutMs, fallbackMessage) {
  let response
  try {
    response = await fetch(url, {
      headers: LRCLIB_HEADERS,
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    throw toLyricsError(error, fallbackMessage)
  }

  let data = null
  if (response.status !== 204) {
    data = await response.json().catch(() => null)
  }
  return { response, data }
}

function readTimeout(options) {
  return Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
    ? options.timeoutMs
    : DEFAULT_TIMEOUT_MS
}

export async function searchLyrics(query, options = {}) {
  const searchQuery = String(query ?? '').trim()
  if (!searchQuery) throw new LyricsError(400, 'Missing query')
  if (searchQuery.length > MAX_QUERY_LENGTH) throw new LyricsError(400, 'Query is too long')

  const url = new URL(`${LRCLIB_API}/search`)
  url.searchParams.set('q', searchQuery)

  const { response, data } = await requestJson(url, readTimeout(options), 'Lyrics search failed')

  if (response.status === 404) return []
  if (!response.ok) throw new LyricsError(502, `Lyrics search failed (${response.status})`)
  if (!Array.isArray(data)) throw new LyricsError(502, 'Lyrics search returned an invalid response')

  return data
}

function trimmedString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function getLyrics(params = {}, options = {}) {
  const input = params && typeof params === 'object' ? params : {}
  const id = trimmedString(input.id)
  const artistName = trimmedString(input.artist_name)
  const trackName = trimmedString(input.track_name)
  const albumName = trimmedString(input.album_name)

  if (id) {
    if (!new RegExp(`^\\d{1,${MAX_ID_LENGTH}}$`).test(id)) {
      throw new LyricsError(400, 'id must be a numeric LRCLIB identifier')
    }
  } else if (!artistName || !trackName) {
    throw new LyricsError(400, 'artist_name and track_name are required')
  }

  if (artistName.length > MAX_QUERY_LENGTH || trackName.length > MAX_QUERY_LENGTH) {
    throw new LyricsError(400, 'Query is too long')
  }
  if (albumName.length > MAX_QUERY_LENGTH) throw new LyricsError(400, 'Query is too long')

  let url
  if (id) {
    url = new URL(`${LRCLIB_API}/get/${id}`)
  } else {
    url = new URL(`${LRCLIB_API}/get`)
    url.searchParams.set('artist_name', artistName)
    url.searchParams.set('track_name', trackName)
    if (albumName) url.searchParams.set('album_name', albumName)
    if (input.duration !== undefined && input.duration !== null && input.duration !== '') {
      const duration = Number(input.duration)
      if (!Number.isInteger(duration) || duration <= 0) {
        throw new LyricsError(400, 'duration must be a positive number of seconds')
      }
      url.searchParams.set('duration', String(duration))
    }
  }

  const { response, data } = await requestJson(url, readTimeout(options), 'Lyrics lookup failed')

  if (response.status === 404) throw new LyricsError(404, 'Lyrics not found')
  if (!response.ok) throw new LyricsError(502, `Lyrics lookup failed (${response.status})`)
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new LyricsError(502, 'Lyrics lookup returned an invalid response')
  }

  return data
}
