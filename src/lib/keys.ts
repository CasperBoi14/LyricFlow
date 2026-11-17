const YOUTUBE_KEY = 'lf-youtube-key'
const AUDD_KEY = 'lf-audd-token'

function envValue(name: 'VITE_YOUTUBE_API_KEY' | 'VITE_AUDD_API_TOKEN'): string {
  const value = import.meta.env[name] as string | undefined
  return typeof value === 'string' ? value.trim() : ''
}

function stored(key: string): string {
  try {
    return localStorage.getItem(key)?.trim() || ''
  } catch {
    return ''
  }
}

function store(key: string, value: string) {
  try {
    if (value.trim()) localStorage.setItem(key, value.trim())
    else localStorage.removeItem(key)
  } catch { /* storage unavailable */ }
}

/** YouTube Data API v3 key used for full-length playback without a backend. */
export function getYouTubeApiKey(): string {
  return stored(YOUTUBE_KEY) || envValue('VITE_YOUTUBE_API_KEY')
}

export function setYouTubeApiKey(value: string) {
  store(YOUTUBE_KEY, value)
}

/** AudD token used for microphone recognition without a backend. */
export function getAuddToken(): string {
  return stored(AUDD_KEY) || envValue('VITE_AUDD_API_TOKEN')
}

export function setAuddToken(value: string) {
  store(AUDD_KEY, value)
}
