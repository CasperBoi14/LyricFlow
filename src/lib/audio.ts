export type AudioSource = { youtubeId?: string; audioUrl?: string; cover?: string }

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

export async function findAudioSource(title: string, artist: string): Promise<AudioSource> {
  const q = `${title} ${artist}`.trim()

  try {
    const res = await fetch(`/api/audio/find?q=${encodeURIComponent(`${q} official audio`)}`)
    const data = await res.json().catch(() => ({}))
    if (res.ok && data?.videoId) {
      return { youtubeId: data.videoId, cover: data.thumbnail || undefined }
    }
  } catch { /* fall through to preview */ }

  try {
    const res = await fetch(`/api/music/search?q=${encodeURIComponent(q)}`)
    const data = await res.json().catch(() => ({}))
    const hit = (data.results || []).find((r: any) => r?.previewUrl)
    if (hit) return { audioUrl: hit.previewUrl, cover: hit.artworkUrl100 || undefined }
  } catch { /* no audio */ }

  return {}
}
