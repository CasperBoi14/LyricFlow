import { getSpotifyAccessToken, hasSpotifyPlayback, spotifyFetch } from './spotify'

export type SpotifyPlaybackState = {
  paused: boolean
  position: number
  duration: number
  uri: string | null
}

export type SpotifySnapshot = SpotifyPlaybackState & { at: number }

let sdkPromise: Promise<any> | null = null
let player: any = null
let deviceId: string | null = null
let connecting: Promise<any | null> | null = null
let unavailable: string | null = null
let snapshot: SpotifySnapshot | null = null

/** Tracks Spotify refused to play, so the app can fall back to YouTube without looping. */
const blockedUris = new Set<string>()

const delay = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))
const timeout = <T,>(ms: number, value: T) => Promise.race([delay(ms).then(() => value), new Promise<T>(() => { /* never */ })])

function loadSdk(): Promise<any> {
  const w = window as any
  if (w.Spotify?.Player) return Promise.resolve(w.Spotify)
  if (sdkPromise) return sdkPromise
  sdkPromise = new Promise((resolve, reject) => {
    const fail = () => {
      sdkPromise = null
      reject(new Error('Spotify player could not load.'))
    }
    const timer = window.setTimeout(fail, 12_000)
    const previous = w.onSpotifyWebPlaybackSDKReady
    w.onSpotifyWebPlaybackSDKReady = () => {
      window.clearTimeout(timer)
      previous?.()
      if (w.Spotify?.Player) resolve(w.Spotify)
      else fail()
    }
    const script = document.createElement('script')
    script.src = 'https://sdk.scdn.co/spotify-player.js'
    script.async = true
    script.onerror = () => { window.clearTimeout(timer); fail() }
    document.head.appendChild(script)
  })
  return sdkPromise
}

function publish(state: any) {
  if (!state) return
  snapshot = {
    paused: !!state.paused,
    position: Math.max(0, (state.position || 0) / 1000),
    duration: Math.max(0, (state.duration || 0) / 1000),
    uri: state.track_window?.current_track?.uri || null,
    at: performance.now(),
  }
}

export function canUseSpotifyPlayback(): boolean {
  return !unavailable && hasSpotifyPlayback()
}

export function spotifyUnavailableReason(): string | null {
  return unavailable
}

export function blockSpotifyUri(uri: string | undefined) {
  if (uri) blockedUris.add(uri)
}

export function isSpotifyUriBlocked(uri: string | undefined): boolean {
  return !!uri && blockedUris.has(uri)
}

export function markSpotifyUnavailable(reason: string) {
  unavailable = reason
  deviceId = null
  snapshot = null
  connecting = null
  try { player?.disconnect?.() } catch { /* ignore */ }
  player = null
}

/** Drop the SDK device (e.g. after disconnecting the account) so a new session can connect cleanly. */
export function resetSpotifyPlayer() {
  markSpotifyUnavailable('Spotify was disconnected.')
  unavailable = null
  sdkPromise = null
}

export function getSpotifySnapshot(): SpotifySnapshot | null {
  return snapshot
}

export function refreshSpotifyState() {
  const current = player
  if (!current?.getCurrentState) return
  current.getCurrentState()
    .then((state: any) => { if (state) publish(state) })
    .catch(() => { /* transient */ })
}

export function connectSpotifyDevice(): Promise<any | null> {
  if (unavailable) return Promise.resolve(null)
  if (player && deviceId) return Promise.resolve(player)
  if (connecting) return connecting
  if (!hasSpotifyPlayback()) {
    unavailable = 'Reconnect Spotify to enable playback.'
    return Promise.resolve(null)
  }

  connecting = (async () => {
    let Spotify: any
    try {
      Spotify = await loadSdk()
    } catch {
      markSpotifyUnavailable('The Spotify player could not load.')
      return null
    }

    let token: string | null = null
    try { token = await getSpotifyAccessToken() } catch { /* handled below */ }
    if (!token) {
      markSpotifyUnavailable('Spotify login needs to be refreshed.')
      return null
    }

    const next = new Spotify.Player({
      name: 'LyricFlow',
      volume: 0.9,
      getOAuthToken: (cb: (value: string) => void) => {
        getSpotifyAccessToken().then((fresh) => { if (fresh) cb(fresh) }).catch(() => { /* SDK retries */ })
      },
    })
    player = next

    const ready = new Promise<boolean>((resolve) => {
      const fail = (message: string) => {
        if (!unavailable) markSpotifyUnavailable(message)
        resolve(false)
      }
      next.addListener('ready', ({ device_id }: { device_id: string }) => {
        deviceId = device_id
        resolve(true)
      })
      next.addListener('initialization_error', (event: any) => fail(event?.message || 'The Spotify player could not start.'))
      next.addListener('authentication_error', () => fail('Spotify login needs to be refreshed.'))
      next.addListener('account_error', () => fail('Spotify playback needs a Premium account.'))
      next.addListener('not_ready', () => { deviceId = null })
      next.addListener('player_state_changed', (state: any) => publish(state))
    })

    let connected = false
    try { connected = await Promise.race([next.connect(), timeout(9_000, false)]) } catch { connected = false }
    if (!connected) {
      if (!unavailable) markSpotifyUnavailable('The Spotify player did not connect.')
      return null
    }
    const isReady = await Promise.race([ready, timeout(9_000, false)])
    if (!isReady) {
      if (!unavailable) markSpotifyUnavailable('The Spotify player did not become ready.')
      return null
    }
    try { await next.activateElement?.() } catch { /* older SDKs */ }
    return next
  })()

  const pending = connecting
  const clearConnecting = () => { if (connecting === pending) connecting = null }
  pending.then(clearConnecting, clearConnecting)
  return pending
}

export async function spotifyPlayUri(uri: string, positionSeconds = 0) {
  const current = await connectSpotifyDevice()
  if (!current || !deviceId) throw new Error(unavailable || 'The Spotify player is not ready.')
  try { await current.activateElement?.() } catch { /* ignore */ }
  await spotifyFetch(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
    method: 'PUT',
    body: JSON.stringify({ uris: [uri], position_ms: Math.max(0, Math.round(positionSeconds * 1000)) }),
  })
}

export async function spotifyPausePlayback() {
  const current = player
  if (!current?.pause) return
  try { await current.pause() } catch { /* ignore */ }
}

export async function spotifySeekTo(seconds: number) {
  const current = player
  if (!current?.seek) return
  try { await current.seek(Math.max(0, Math.round(seconds * 1000))) } catch { /* ignore */ }
}
