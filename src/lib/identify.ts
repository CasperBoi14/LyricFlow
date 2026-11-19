import { apiUrl, hasBackend } from './api'
import { getAuddToken } from './keys'

export type IdentifyMatch = {
  title: string
  artist: string
  album?: string
  cover?: string
  url?: string
  provider?: string
}

const AUDD_ENDPOINT = 'https://api.audd.io/'

function auddMessage(data: any): string {
  const message = data?.error?.error_message
  return typeof message === 'string' && message.trim() ? message.trim() : 'Recognition failed'
}

function auddArtwork(result: any): string | undefined {
  const url = result?.apple_music?.artwork?.url
  if (typeof url !== 'string' || !url) return undefined
  return url.replace('{w}x{h}bb', '400x400bb')
}

async function auddRecognize(blob: Blob, token: string): Promise<IdentifyMatch> {
  const form = new FormData()
  form.set('api_token', token)
  form.set('return', 'apple_music,spotify')
  form.set('file', blob, 'sample.wav')

  let res: Response
  try {
    res = await fetch(AUDD_ENDPOINT, { method: 'POST', body: form })
  } catch {
    throw new Error('Could not reach the recognition service.')
  }

  const data = await res.json().catch(() => null)
  if (!res.ok || data?.status === 'error') {
    const message = auddMessage(data)
    if (/token/i.test(message)) throw new Error(`Recognition token was rejected: ${message}`)
    throw new Error(message)
  }

  const result = data?.result
  if (!result || typeof result.title !== 'string' || !result.title) throw new Error('No match found')

  return {
    title: result.title,
    artist: typeof result.artist === 'string' && result.artist ? result.artist : 'Unknown Artist',
    album: typeof result.album === 'string' && result.album ? result.album : undefined,
    cover: auddArtwork(result),
    url: typeof result.song_link === 'string' ? result.song_link : result?.spotify?.external_urls?.spotify,
    provider: 'AudD',
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => {
      const s = String(r.result || '')
      resolve(s.includes(',') ? s.split(',')[1] : s)
    }
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

export async function identifyRecorded(blob: Blob): Promise<IdentifyMatch> {
  const token = getAuddToken()
  if (token) return auddRecognize(blob, token)

  if (hasBackend) {
    const sample = await blobToBase64(blob)
    const res = await fetch(apiUrl('/api/identify'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sample }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.error || data?.message || 'Identification failed')
    if (!data?.title) throw new Error('No match found')
    return data as IdentifyMatch
  }

  throw new Error('Add an AudD token in Audio providers to recognize songs from the browser.')
}
