const ITUNES_SEARCH_URL = 'https://itunes.apple.com/search'

export class AudioFindError extends Error {
  constructor(statusCode, message) {
    super(message)
    this.name = 'AudioFindError'
    this.statusCode = statusCode
  }
}

/** The backend supplies direct previews only. No video provider is queried. */
export async function findAudioSource(query, options = {}) {
  const searchQuery = String(query ?? '').trim()
  if (!searchQuery) throw new AudioFindError(400, 'Missing query')
  const url = new URL(ITUNES_SEARCH_URL)
  url.searchParams.set('term', searchQuery)
  url.searchParams.set('entity', 'song')
  url.searchParams.set('limit', '10')

  const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : 10_000
  let response
  try { response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) }) }
  catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw new AudioFindError(504, 'Audio lookup timed out')
    throw new AudioFindError(502, 'Audio lookup failed')
  }
  if (!response.ok) throw new AudioFindError(502, `Audio lookup failed (${response.status})`)
  const data = await response.json().catch(() => null)
  if (!data || !Array.isArray(data.results)) throw new AudioFindError(502, 'Audio lookup returned invalid data')
  const hit = data.results.find((item) => item && typeof item.previewUrl === 'string' && item.previewUrl)
  if (!hit) throw new AudioFindError(404, 'No audio preview found')
  const cover = typeof hit.artworkUrl100 === 'string' ? hit.artworkUrl100.replace('100x100bb', '400x400bb') : undefined
  return cover ? { audioUrl: hit.previewUrl, cover } : { audioUrl: hit.previewUrl }
}
