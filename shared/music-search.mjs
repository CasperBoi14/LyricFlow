const ITUNES_SEARCH_URL = 'https://itunes.apple.com/search'
const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_LIMIT = 20
const MAX_QUERY_LENGTH = 300

export class MusicSearchError extends Error {
  constructor(statusCode, message) {
    super(message)
    this.name = 'MusicSearchError'
    this.statusCode = statusCode
  }
}

function toMusicSearchError(error) {
  if (error instanceof MusicSearchError) return error
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return new MusicSearchError(504, 'Music search timed out')
  }
  return new MusicSearchError(502, 'Music search failed')
}

function coverFor(artworkUrl) {
  if (typeof artworkUrl !== 'string' || !artworkUrl) return ''
  return artworkUrl.replace('100x100bb', '400x400bb')
}

function normalizeResult(item) {
  if (!item || typeof item !== 'object') return null

  const title = typeof item.trackName === 'string' ? item.trackName.trim() : ''
  const artist = typeof item.artistName === 'string' ? item.artistName.trim() : ''
  if (!title || !artist) return null

  return {
    id: item.trackId ?? item.collectionId ?? `${title}-${artist}`,
    title,
    artist,
    album: typeof item.collectionName === 'string' ? item.collectionName : 'Single',
    duration: Math.round(Number(item.trackTimeMillis) / 1000) || 0,
    cover: coverFor(item.artworkUrl100 || item.artworkUrl60),
    previewUrl: typeof item.previewUrl === 'string' ? item.previewUrl : '',
    externalUrl: typeof item.trackViewUrl === 'string' ? item.trackViewUrl : '',
    source: 'itunes',
  }
}

export async function searchMusic(query, options = {}) {
  const searchQuery = String(query ?? '').trim()
  if (!searchQuery) throw new MusicSearchError(400, 'Missing query')
  if (searchQuery.length > MAX_QUERY_LENGTH) {
    throw new MusicSearchError(400, 'Query is too long')
  }

  const timeoutMs =
    Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
      ? options.timeoutMs
      : DEFAULT_TIMEOUT_MS
  const limit =
    Number.isFinite(options.limit) && options.limit > 0 && options.limit <= 50
      ? Math.floor(options.limit)
      : DEFAULT_LIMIT

  const url = new URL(ITUNES_SEARCH_URL)
  url.searchParams.set('term', searchQuery)
  url.searchParams.set('media', 'music')
  url.searchParams.set('entity', 'song')
  url.searchParams.set('limit', String(limit))

  let response
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  } catch (error) {
    throw toMusicSearchError(error)
  }

  if (!response.ok) {
    throw new MusicSearchError(502, `Music search failed (${response.status})`)
  }

  const data = await response.json().catch(() => null)
  if (!data || typeof data !== 'object') {
    throw new MusicSearchError(502, 'Music search returned an invalid response')
  }

  const rows = Array.isArray(data.results) ? data.results : []
  const results = rows.map(normalizeResult).filter((item) => item !== null)

  return { results }
}
