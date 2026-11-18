import { apiUrl, hasBackend } from './api'

export type AudioSource = { audioUrl?: string; cover?: string }

async function backendSource(query: string): Promise<AudioSource | null> {
  if (!hasBackend) return null
  try {
    const res = await fetch(apiUrl(`/api/audio/find?q=${encodeURIComponent(query)}`))
    const data = await res.json().catch(() => null) as { audioUrl?: string; cover?: string } | null
    return res.ok && typeof data?.audioUrl === 'string' ? { audioUrl: data.audioUrl, cover: data.cover } : null
  } catch { return null }
}

async function previewSource(query: string): Promise<AudioSource> {
  try {
    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=20`)
    const data = await res.json().catch(() => ({}))
    const hit = (data.results || []).find((row: any) => row?.previewUrl)
    if (hit) return {
      audioUrl: hit.previewUrl,
      cover: typeof hit.artworkUrl100 === 'string' ? hit.artworkUrl100.replace('100x100bb', '400x400bb') : undefined,
    }
  } catch { /* no preview available */ }
  return {}
}

export function isPreviewAudioUrl(url: string | undefined): boolean {
  return typeof url === 'string' && /(?:itunes|mzstatic|audio-ssl)\./i.test(url)
}

/** Spotify is preferred; this returns a direct audio file or a short preview. */
export async function findAudioSource(title: string, artist: string): Promise<AudioSource> {
  const query = `${title} ${artist}`.trim()
  return await backendSource(query) || await previewSource(query)
}
