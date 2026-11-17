import { apiUrl, hasBackend } from './api'

export type SpotifyTokens = { access_token: string; refresh_token?: string; expires_at: number; scope?: string }

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
  items?: { total: number }
  tracks?: { total: number }
  owner?: { id?: string; display_name?: string }
  collaborative?: boolean
  uri?: string
  external_urls?: { spotify?: string }
}

export type SpotifyServerConfig = {
  configured: boolean
  clientId: string | null
  serverTokenExchange: boolean
}

export type SpotifyTrack = {
  id: string | null
  name: string
  artists: { name: string }[]
  album: { name: string; images?: { url: string }[] }
  duration_ms: number
  external_urls?: { spotify?: string }
  uri?: string
  type?: string
}

export class SpotifyApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}

const CLIENT_KEY = 'lf-spotify-client'
const TOKEN_KEY = 'lf-spotify-token'
const VERIFIER_KEY = 'lf-spotify-verifier'
const STATE_KEY = 'lf-spotify-state'
const SCOPE = 'playlist-read-private playlist-read-collaborative user-read-private user-read-email user-read-playback-state user-modify-playback-state streaming'

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

function randomString(length: number): string {
  return b64url(crypto.getRandomValues(new Uint8Array(length))).slice(0, length)
}

function redirectUri(): string {
  const configured = (import.meta.env.BASE_URL as string | undefined) || '/'
  const base = configured.endsWith('/') ? configured : `${configured}/`
  const url = new URL(base, window.location.origin)
  // Spotify rejects `localhost` as a redirect URI; loopback IP literals are still allowed.
  if (url.hostname === 'localhost') url.hostname = '127.0.0.1'
  return url.toString()
}

export function getSpotifyClientId(): string {
  return localStorage.getItem(CLIENT_KEY) || (import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined) || ''
}

let serverConfigPromise: Promise<SpotifyServerConfig | null> | null = null

export function getSpotifyServerConfig(force = false): Promise<SpotifyServerConfig | null> {
  if (!hasBackend) return Promise.resolve(null)
  if (force) serverConfigPromise = null
  if (!serverConfigPromise) {
    serverConfigPromise = (async () => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 5000)
      try {
        const res = await fetch(apiUrl('/api/spotify/config'), { cache: 'no-store', signal: controller.signal })
        if (!res.ok) return null
        return await res.json() as SpotifyServerConfig
      } catch {
        return null
      } finally {
        clearTimeout(timer)
      }
    })().then((config) => {
      if (!config) serverConfigPromise = null
      return config
    })
  }
  return serverConfigPromise
}

async function resolveSpotifyClientId(): Promise<string> {
  if (hasBackend) {
    const config = await getSpotifyServerConfig()
    if (config?.clientId) return config.clientId
  }
  return getSpotifyClientId()
}

export function setSpotifyClientId(id: string) {
  if (id.trim()) localStorage.setItem(CLIENT_KEY, id.trim())
  else localStorage.removeItem(CLIENT_KEY)
}

export function spotifyRedirectTarget(): string {
  return redirectUri()
}

let cachedTokens: SpotifyTokens | null | undefined

function loadTokens(): SpotifyTokens | null {
  if (cachedTokens !== undefined) return cachedTokens
  try {
    const raw = localStorage.getItem(TOKEN_KEY)
    if (!raw) { cachedTokens = null; return null }
    const t = JSON.parse(raw)
    if (t?.access_token) { cachedTokens = t; return t }
  } catch { /* ignore */ }
  cachedTokens = null
  return cachedTokens
}

function saveTokens(tokens: SpotifyTokens) {
  cachedTokens = tokens
  localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens))
}

export function hasSpotifyAuth(): boolean {
  return !!loadTokens()?.refresh_token
}

/** In-app playback needs the streaming scope, granted by reconnecting after this version. */
export function hasSpotifyPlayback(): boolean {
  const tokens = loadTokens()
  if (!tokens?.refresh_token) return false
  return (tokens.scope || '').split(' ').includes('streaming')
}

export function disconnectSpotify() {
  cachedTokens = null
  localStorage.removeItem(TOKEN_KEY)
}

let refreshPromise: Promise<string | null> | null = null

async function tokenRequest(body: Record<string, string>) {
  // Our backend takes JSON and talks to Spotify itself; a direct browser call must use
  // Spotify's form encoding, because its token endpoint does not accept JSON bodies.
  const direct = !hasBackend
  const res = await fetch(direct ? 'https://accounts.spotify.com/api/token' : apiUrl('/api/spotify/token'), {
    method: 'POST',
    headers: { 'Content-Type': direct ? 'application/x-www-form-urlencoded' : 'application/json' },
    body: direct ? new URLSearchParams(body).toString() : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data?.error) throw new Error(data?.error_description || data?.error || 'Spotify token request failed')
  return data as { access_token: string; refresh_token?: string; expires_in: number; scope?: string }
}

async function resolveAuthorizeUrl(clientId: string, state: string, challenge: string): Promise<string> {
  const redirect = redirectUri()
  if (hasBackend) {
    try {
      const query = new URLSearchParams({ state, challenge, redirect_uri: redirect })
      const res = await fetch(apiUrl(`/api/spotify/login?${query.toString()}`), { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json().catch(() => null) as { url?: string } | null
        if (data?.url) return data.url
      }
    } catch { /* build the URL in the browser below */ }
  }
  if (!clientId) {
    throw new Error(hasBackend
      ? 'Spotify is not configured on the server. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET.'
      : 'Add your Spotify Client ID first.')
  }
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirect,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
    scope: SCOPE,
  })
  return `https://accounts.spotify.com/authorize?${params.toString()}`
}

export async function beginSpotifyLogin() {
  const verifier = randomString(64)
  const state = randomString(16)
  const challengeBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  sessionStorage.setItem(VERIFIER_KEY, verifier)
  sessionStorage.setItem(STATE_KEY, state)
  const clientId = await resolveSpotifyClientId()
  window.location.assign(await resolveAuthorizeUrl(clientId, state, b64url(new Uint8Array(challengeBytes))))
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
      client_id: await resolveSpotifyClientId(),
      code_verifier: verifier,
    })
    saveTokens({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: Date.now() + tokens.expires_in * 1000,
      scope: tokens.scope,
    })
    return true
  } finally {
    clean()
  }
}

async function getAccessToken(forceRefresh = false): Promise<string | null> {
  const tokens = loadTokens()
  if (!tokens) return null
  if (!forceRefresh && tokens.expires_at - 60_000 > Date.now()) return tokens.access_token
  if (!tokens.refresh_token) return null
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const fresh = await tokenRequest({
          grant_type: 'refresh_token',
          refresh_token: tokens.refresh_token!,
          client_id: await resolveSpotifyClientId(),
        })
        const next: SpotifyTokens = {
          access_token: fresh.access_token,
          refresh_token: fresh.refresh_token || tokens.refresh_token,
          expires_at: Date.now() + fresh.expires_in * 1000,
          scope: fresh.scope || tokens.scope,
        }
        saveTokens(next)
        return next.access_token
      } catch (error) {
        // A network outage should not erase a valid connection. An invalid refresh
        // token, on the other hand, requires the user to sign in again.
        if (error instanceof Error && /invalid_grant|invalid client/i.test(error.message)) disconnectSpotify()
        throw error
      }
    })().finally(() => { refreshPromise = null })
  }
  return refreshPromise
}

async function authorizedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  let token = await getAccessToken()
  if (!token) throw new Error('Connect Spotify to continue.')
  const send = (accessToken: string) => {
    const headers = new Headers(init.headers)
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
    headers.set('Authorization', `Bearer ${accessToken}`)
    return fetch(`https://api.spotify.com/v1${path}`, { ...init, headers })
  }
  let res = await send(token)
  if (res.status === 401) {
    token = await getAccessToken(true)
    if (!token) throw new Error('Spotify session expired. Connect again.')
    res = await send(token)
    if (res.status === 401) {
      disconnectSpotify()
      throw new Error('Spotify session expired. Connect again.')
    }
  }
  return res
}

async function api<T>(path: string): Promise<T> {
  const res = await authorizedFetch(path)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new SpotifyApiError((data as any)?.error?.message || `Spotify request failed (${res.status})`, res.status)
  return data as T
}

export async function getSpotifyAccessToken(): Promise<string | null> {
  return getAccessToken()
}

/** Authenticated request against the Spotify Web API that exposes the raw response (204s included). */
export async function spotifyFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await authorizedFetch(path, init)
  if (!res.ok) {
    let message = ''
    try {
      const data = await res.json()
      message = (data as any)?.error?.message || ''
    } catch { /* ignore */ }
    throw new Error(message || `Spotify request failed (${res.status})`)
  }
  return res
}

/** Find the Spotify URI for a searched song so it can be played through the user's account. */
export async function findSpotifyTrack(title: string, artist: string): Promise<string | null> {
  const query = [title, artist].filter((part) => part.trim()).join(' ').trim()
  if (!query) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 6000)
  try {
    const res = await spotifyFetch(`/search?q=${encodeURIComponent(query)}&type=track&limit=1`, { signal: controller.signal })
    const data = await res.json().catch(() => null) as { tracks?: { items?: { uri?: string }[] } } | null
    const uri = data?.tracks?.items?.[0]?.uri
    return typeof uri === 'string' && uri.startsWith('spotify:track:') ? uri : null
  } finally {
    clearTimeout(timer)
  }
}

export const getSpotifyMe = () => api<SpotifyProfile>('/me')
export const getSpotifyPlaylists = (offset = 0) =>
  api<{ items: SpotifyPlaylist[]; next: string | null }>(`/me/playlists?limit=50&offset=${offset}`)
export async function getSpotifyPlaylistTracks(id: string, offset = 0) {
  const page = await api<{ items: { item?: SpotifyTrack | null; track?: SpotifyTrack | null }[]; next: string | null }>(
    `/playlists/${encodeURIComponent(id)}/items?limit=50&offset=${offset}`,
  )
  return {
    tracks: (page.items || []).map((row) => row.item || row.track).filter((track): track is SpotifyTrack =>
      !!track && track.type !== 'episode' && !!track.name && !!track.uri?.startsWith('spotify:track:')),
    nextOffset: page.next ? offset + page.items.length : null,
  }
}
