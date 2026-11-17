import { config } from '../config/env.js'
import { BadRequestError, HttpError, NotFoundError, UpstreamError } from '../lib/errors.js'
import { fetchWithTimeout } from '../lib/fetch.js'

const YOUTUBE_DATA_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search'
const YOUTUBE_WEB_SEARCH_URL = 'https://www.youtube.com/youtubei/v1/search?prettyPrint=false'
const ITUNES_SEARCH_URL = 'https://itunes.apple.com/search'

const YOUTUBE_CLIENT_VERSION = '2.20250101.00.00'
const YOUTUBE_TIMEOUT_MS = 10_000
const PREVIEW_TIMEOUT_MS = 10_000
const VIDEO_ID_PATTERN = /^[\w-]{11}$/

const YOUTUBE_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

export type AudioSource = { youtubeId: string; cover: string } | { audioUrl: string; cover?: string }

type YouTubeSearchResponse = {
  items?: Array<{
    id?: { videoId?: string }
    snippet?: {
      thumbnails?: {
        high?: { url?: string }
        medium?: { url?: string }
        default?: { url?: string }
      }
    }
  }>
}

type ITunesSearchResponse = {
  results?: Array<{
    previewUrl?: string
    artworkUrl100?: string
  }>
}

async function fetchJson<T>(input: string | URL, init: RequestInit, timeoutMs: number): Promise<T> {
  const response = await fetchWithTimeout(input, init, timeoutMs)
  if (!response.ok) {
    throw new UpstreamError(`Upstream request failed (${response.status})`)
  }

  const data: unknown = await response.json().catch(() => null)
  if (!data || typeof data !== 'object') {
    throw new UpstreamError('Upstream service returned an invalid response')
  }
  return data as T
}

function youtubeCover(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
}

function findVideoId(node: unknown): string | null {
  if (!node || typeof node !== 'object') return null

  if (Array.isArray(node)) {
    for (const item of node) {
      const videoId = findVideoId(item)
      if (videoId) return videoId
    }
    return null
  }

  const record = node as Record<string, unknown>
  const renderer = record.videoRenderer
  if (renderer && typeof renderer === 'object') {
    const videoId = (renderer as Record<string, unknown>).videoId
    if (typeof videoId === 'string' && VIDEO_ID_PATTERN.test(videoId)) return videoId
  }

  for (const value of Object.values(record)) {
    const videoId = findVideoId(value)
    if (videoId) return videoId
  }
  return null
}

async function searchYouTubeDataApi(query: string): Promise<AudioSource | null> {
  const url = new URL(YOUTUBE_DATA_SEARCH_URL)
  url.searchParams.set('part', 'snippet')
  url.searchParams.set('type', 'video')
  url.searchParams.set('maxResults', '1')
  url.searchParams.set('q', query)
  url.searchParams.set('order', 'relevance')
  url.searchParams.set('videoEmbeddable', 'true')
  url.searchParams.set('videoSyndicated', 'true')
  url.searchParams.set('safeSearch', 'none')
  url.searchParams.set(
    'fields',
    'items(id/videoId,snippet/thumbnails/high/url,snippet/thumbnails/medium/url,snippet/thumbnails/default/url)',
  )
  url.searchParams.set('key', config.youtubeApiKey)

  const data = await fetchJson<YouTubeSearchResponse>(url, {}, YOUTUBE_TIMEOUT_MS)
  const video = data.items?.[0]
  if (!video) return null

  const youtubeId = video.id?.videoId
  if (typeof youtubeId !== 'string' || !VIDEO_ID_PATTERN.test(youtubeId)) return null

  const thumbnails = video.snippet?.thumbnails
  const cover =
    thumbnails?.high?.url ??
    thumbnails?.medium?.url ??
    thumbnails?.default?.url ??
    youtubeCover(youtubeId)

  return { youtubeId, cover }
}

async function searchYouTubeWeb(query: string): Promise<AudioSource | null> {
  const data = await fetchJson<unknown>(
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
    YOUTUBE_TIMEOUT_MS,
  )

  const youtubeId = findVideoId(data)
  if (!youtubeId) return null
  return { youtubeId, cover: youtubeCover(youtubeId) }
}

async function findPreview(query: string): Promise<AudioSource> {
  const url = new URL(ITUNES_SEARCH_URL)
  url.searchParams.set('term', query)
  url.searchParams.set('entity', 'song')
  url.searchParams.set('limit', '10')

  const data = await fetchJson<ITunesSearchResponse>(url, {}, PREVIEW_TIMEOUT_MS)
  const results = data.results ?? []
  const match = results.find(
    (item) => typeof item.previewUrl === 'string' && item.previewUrl.length > 0,
  )
  if (!match?.previewUrl) {
    throw new NotFoundError('No playable track found')
  }

  const cover =
    typeof match.artworkUrl100 === 'string'
      ? match.artworkUrl100.replace('100x100bb', '400x400bb')
      : undefined

  return cover ? { audioUrl: match.previewUrl, cover } : { audioUrl: match.previewUrl }
}

export async function findAudioSource(query: string): Promise<AudioSource> {
  const searchQuery = query.trim()
  if (!searchQuery) throw new BadRequestError('Missing query')

  const failures: HttpError[] = []
  const searches: Array<() => Promise<AudioSource | null>> = []

  if (config.youtubeApiKey) searches.push(() => searchYouTubeDataApi(searchQuery))
  searches.push(() => searchYouTubeWeb(searchQuery))

  for (const search of searches) {
    try {
      const source = await search()
      if (source) return source
    } catch (error) {
      failures.push(error instanceof HttpError ? error : new UpstreamError('Audio source lookup failed'))
    }
  }

  try {
    return await findPreview(searchQuery)
  } catch (error) {
    const failure =
      error instanceof HttpError ? error : new UpstreamError('Audio source lookup failed')
    if (failure.statusCode === 404) {
      const upstreamFailure = failures.find((item) => item.statusCode === 504) ?? failures[0]
      throw upstreamFailure ?? failure
    }
    failures.push(failure)
    throw failures.find((item) => item.statusCode === 504) ?? failure
  }
}
