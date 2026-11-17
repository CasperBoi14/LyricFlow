import { apiUrl, hasBackend } from './api'

export type AudioSource = { youtubeId?: string; audioUrl?: string; cover?: string }

type SourceResponse = {
  youtubeId?: string
  videoId?: string
  audioUrl?: string
  streamUrl?: string
  url?: string
  cover?: string
  thumbnail?: string
}

let ytApi: Promise<any> | null = null

export function loadYouTubeApi(): Promise<any> {
  const w = window as any
  if (w.YT?.Player) return Promise.resolve(w.YT)
  if (ytApi) return ytApi
  ytApi = new Promise((resolve, reject) => {
    const fail = () => {
      ytApi = null
      reject(new Error('YouTube player failed to load.'))
    }
    const timer = setTimeout(fail, 12000)
    const prev = w.onYouTubeIframeAPIReady
    w.onYouTubeIframeAPIReady = () => {
      clearTimeout(timer)
      prev?.()
      resolve(w.YT)
    }
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    script.async = true
    script.onerror = () => { clearTimeout(timer); fail() }
    document.head.appendChild(script)
  })
  return ytApi
}

async function backendSource(query: string): Promise<AudioSource | null> {
  if (!hasBackend) return null
  try {
    const res = await fetch(apiUrl(`/api/audio/find?q=${encodeURIComponent(`${query} official audio`)}`))
    const data = await res.json().catch(() => null) as SourceResponse | null
    if (!res.ok || !data) return null
    const youtubeId = data.youtubeId || data.videoId
    const audioUrl = data.audioUrl || data.streamUrl || data.url
    if (!youtubeId && !audioUrl) return null
    return { youtubeId, audioUrl, cover: data.cover || data.thumbnail }
  } catch {
    return null
  }
}

async function previewSource(query: string): Promise<AudioSource> {
  try {
    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=20`)
    const data = await res.json().catch(() => ({}))
    const hit = (data.results || []).find((r: any) => r?.previewUrl)
    if (hit) {
      const cover = typeof hit.artworkUrl100 === 'string'
        ? hit.artworkUrl100.replace('100x100bb', '400x400bb')
        : undefined
      return { audioUrl: hit.previewUrl, cover }
    }
  } catch { /* no preview available */ }
  return {}
}

/** iTunes previews only carry 30 seconds, so they are upgraded when a full source can be resolved. */
export function isPreviewAudioUrl(url: string | undefined): boolean {
  return typeof url === 'string' && /(?:itunes|mzstatic|audio-ssl)\./i.test(url)
}

export async function findAudioSource(title: string, artist: string): Promise<AudioSource> {
  const q = `${title} ${artist}`.trim()
  const full = await backendSource(q)
  if (full) return full
  return previewSource(q)
}
