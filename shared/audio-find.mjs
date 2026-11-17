const YOUTUBE_WEB_SEARCH_URL = 'https://www.youtube.com/youtubei/v1/search?prettyPrint=false'
const ITUNES_SEARCH_URL = 'https://itunes.apple.com/search'

const YOUTUBE_CLIENT_VERSION = '2.20250101.00.00'
const YOUTUBE_TIMEOUT_MS = 10_000
const PREVIEW_TIMEOUT_MS = 10_000
const VIDEO_ID_PATTERN = /^[\w-]{11}$/

const YOUTUBE_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

export class AudioFindError extends Error {
  constructor(statusCode, message) {
    super(message)
    this.name = 'AudioFindError'
    this.statusCode = statusCode
  }
}

function toAudioFindError(error) {
  if (error instanceof AudioFindError) return error
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return new AudioFindError(504, 'Upstream request timed out')
  }
  return new AudioFindError(502, 'Upstream request failed')
}

async function requestJson(url, init, timeoutMs) {
  let response
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
  } catch (error) {
    throw toAudioFindError(error)
  }

  if (!response.ok) {
    throw new AudioFindError(502, `Upstream request failed (${response.status})`)
  }

  const data = await response.json().catch(() => null)
  if (!data || typeof data !== 'object') {
    throw new AudioFindError(502, 'Upstream service returned an invalid response')
  }
  return data
}

function youtubeCover(videoId) {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
}

function findVideoId(node) {
  if (!node || typeof node !== 'object') return null

  if (Array.isArray(node)) {
    for (const item of node) {
      const videoId = findVideoId(item)
      if (videoId) return videoId
    }
    return null
  }

  const renderer = node.videoRenderer
  if (renderer && typeof renderer === 'object') {
    const videoId = renderer.videoId
    if (typeof videoId === 'string' && VIDEO_ID_PATTERN.test(videoId)) return videoId
  }

  for (const value of Object.values(node)) {
    const videoId = findVideoId(value)
    if (videoId) return videoId
  }
  return null
}

async function searchYouTubeWeb(query, timeoutMs) {
  const data = await requestJson(
    YOUTUBE_WEB_SEARCH_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': YOUTUBE_USER_AGENT,
        'X-YouTube-Client-Name': '1',
        'X-YouTube-Client-Version': YOUTUBE_CLIENT_VERSION,
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: YOUTUBE_CLIENT_VERSION,
            hl: 'en',
            gl: 'US',
          },
        },
        query,
      }),
    },
    timeoutMs,
  )

  const videoId = findVideoId(data)
  if (!videoId) return null
  return { youtubeId: videoId, cover: youtubeCover(videoId) }
}

async function searchITunes(query, timeoutMs) {
  const url = new URL(ITUNES_SEARCH_URL)
  url.searchParams.set('term', query)
  url.searchParams.set('entity', 'song')
  url.searchParams.set('limit', '10')

  const data = await requestJson(url, {}, timeoutMs)
  const results = Array.isArray(data.results) ? data.results : []
  const match = results.find(
    (item) => item && typeof item.previewUrl === 'string' && item.previewUrl.length > 0,
  )
  if (!match) throw new AudioFindError(404, 'No playable track found')

  const cover =
    typeof match.artworkUrl100 === 'string'
      ? match.artworkUrl100.replace('100x100bb', '400x400bb')
      : undefined

  return cover ? { audioUrl: match.previewUrl, cover } : { audioUrl: match.previewUrl }
}

export async function findAudioSource(query, options = {}) {
  const searchQuery = String(query ?? '').trim()
  if (!searchQuery) throw new AudioFindError(400, 'Missing query')

  const timeoutMs =
    Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : YOUTUBE_TIMEOUT_MS

  const failures = []
  for (const search of [() => searchYouTubeWeb(searchQuery, timeoutMs)]) {
    try {
      const source = await search()
      if (source) return source
    } catch (error) {
      failures.push(toAudioFindError(error))
    }
  }

  try {
    return await searchITunes(searchQuery, Math.min(timeoutMs, PREVIEW_TIMEOUT_MS))
  } catch (error) {
    const failure = toAudioFindError(error)
    if (failure.statusCode === 404) {
      const upstreamFailure = failures.find((item) => item.statusCode === 504) ?? failures[0]
      throw upstreamFailure ?? failure
    }
    failures.push(failure)
    throw failures.find((item) => item.statusCode === 504) ?? failure
  }
}
