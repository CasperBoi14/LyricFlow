export type SpotifyTokens = { access_token: string; refresh_token?: string; expires_at: number }

export type SpotifyProfile = {
  id: string
  display_name: string | null
  email?: string
  images?: { url: string }[]
  product?: string
}

export type SpotifyPlaylist = {
  id: string
  name: string
  description?: string | null
  images?: { url: string }[]
  tracks: { total: number }
  owner?: { display_name?: string }
  uri?: string
  external_urls?: { spotify?: string }
}

export type SpotifyTrack = {
  id: string | null
  name: string
  artists: { name: string }[]
  album: { name: string; images?: { url: string }[] }
  duration_ms: number
  external_urls?: { spotify?: string }
  uri?: string
}

const CLIENT_KEY = 'lf-spotify-client'
const TOKEN_KEY = 'lf-spotify-token'
const VERIFIER_KEY = 'lf-spotify-verifier'
const STATE_KEY = 'lf-spotify-state'
const SCOPE = 'playlist-read-private playlist-read-collaborative user-read-private'

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

function randomString(length: number): string {
  return b64url(crypto.getRandomValues(new Uint8Array(length))).slice(0, length)
}

function redirectUri(): string {
  return `${window.location.origin}/`
}

export function getSpotifyClientId(): string {
  return localStorage.getItem(CLIENT_KEY) || (import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined) || ''
}

export function setSpotifyClientId(id: string) {
  if (id.trim()) localStorage.setItem(CLIENT_KEY, id.trim())
  else localStorage.removeItem(CLIENT_KEY)
}

export function spotifyRedirectTarget(): string {
  return redirectUri()
}

function loadTokens(): SpotifyTokens | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY)
    if (!raw) return null
    const t = JSON.parse(raw)
    if (t?.access_token) return t
  } catch { /* ignore */ }
  return null
}

function saveTokens(tokens: SpotifyTokens) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens))
}

export function hasSpotifyAuth(): boolean {
  return !!loadTokens()?.refresh_token
}

export function disconnectSpotify() {
  localStorage.removeItem(TOKEN_KEY)
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch('/api/spotify/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data?.error) throw new Error(data?.error_description || data?.error || 'Spotify token request failed')
  return data as { access_token: string; refresh_token?: string; expires_in: number }
}

export async function beginSpotifyLogin() {
  const clientId = getSpotifyClientId()
  if (!clientId) throw new Error('Add your Spotify Client ID first.')
  const verifier = randomString(64)
  const state = randomString(16)
  const challengeBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  sessionStorage.setItem(VERIFIER_KEY, verifier)
  sessionStorage.setItem(STATE_KEY, state)
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri(),
    code_challenge_method: 'S256',
    code_challenge: b64url(new Uint8Array(challengeBytes)),
    state,
    scope: SCOPE,
  })
  window.location.assign(`https://accounts.spotify.com/authorize?${params.toString()}`)
}

export async function completeSpotifyLogin(): Promise<boolean> {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const error = params.get('error')
  if (!code && !error) return false

  const clean = () => window.history.replaceState({}, '', window.location.pathname)
  if (error) { clean(); throw new Error(`Spotify login canceled (${error}).`) }
  if (params.get('state') !== sessionStorage.getItem(STATE_KEY)) {
    clean()
    throw new Error('Spotify login failed: state mismatch. Try again.')
  }
  const verifier = sessionStorage.getItem(VERIFIER_KEY)
  sessionStorage.removeItem(VERIFIER_KEY)
  sessionStorage.removeItem(STATE_KEY)
  if (!verifier) { clean(); throw new Error('Spotify login expired. Try again.') }

  try {
    const tokens = await tokenRequest({
      grant_type: 'authorization_code',
      code: code as string,
      redirect_uri: redirectUri(),
      client_id: getSpotifyClientId(),
      code_verifier: verifier,
    })
    saveTokens({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: Date.now() + tokens.expires_in * 1000,
    })
    return true
  } finally {
    clean()
  }
}

async function getAccessToken(): Promise<string | null> {
  const tokens = loadTokens()
  if (!tokens) return null
  if (tokens.expires_at - 60_000 > Date.now()) return tokens.access_token
  if (!tokens.refresh_token) return tokens.access_token
  try {
    const fresh = await tokenRequest({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
      client_id: getSpotifyClientId(),
    })
    const next: SpotifyTokens = {
      access_token: fresh.access_token,
      refresh_token: fresh.refresh_token || tokens.refresh_token,
      expires_at: Date.now() + fresh.expires_in * 1000,
    }
    saveTokens(next)
    return next.access_token
  } catch {
    disconnectSpotify()
    return null
  }
}

async function api<T>(path: string): Promise<T> {
  const token = await getAccessToken()
  if (!token) throw new Error('Connect Spotify to load your playlists.')
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json().catch(() => ({}))
  if (res.status === 401) {
    disconnectSpotify()
    throw new Error('Spotify session expired. Connect again.')
  }
  if (!res.ok) throw new Error((data as any)?.error?.message || 'Spotify request failed')
  return data as T
}

export const getSpotifyMe = () => api<SpotifyProfile>('/me')
export const getSpotifyPlaylists = () => api<{ items: SpotifyPlaylist[] }>('/me/playlists?limit=50')
export const getSpotifyPlaylistTracks = (id: string) =>
  api<{ items: { track: SpotifyTrack | null }[] }>(`/playlists/${encodeURIComponent(id)}/tracks?limit=100`)
