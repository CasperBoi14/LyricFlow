import { useEffect, useRef } from 'react'
import { getSpotifyActivePlayback, getSpotifyRateLimitUntil, SpotifyApiError, type SpotifyActivePlayback } from './spotify'

/** Keep the open page aligned with the account's active Spotify Connect device. */
export function useSpotifyFollow(
  ready: boolean,
  onPlayback: (playback: SpotifyActivePlayback | null) => void,
  onError: (message: string | null) => void,
) {
  const callbacks = useRef({ onPlayback, onError })
  const pollNow = useRef<() => void>(() => {})
  useEffect(() => { callbacks.current = { onPlayback, onError } })

  useEffect(() => {
    if (!ready) return
    let stopped = false
    let pending = false
    let timer = 0

    const poll = async () => {
      if (stopped || pending) return
      pending = true
      let wait = document.hidden ? 60_000 : 8_000
      try {
        const playback = await getSpotifyActivePlayback()
        if (!stopped) {
          callbacks.current.onError(null)
          callbacks.current.onPlayback(playback)
          if (!document.hidden && playback?.playing && playback.duration > playback.position) {
            wait = Math.min(wait, Math.max(3_000, (playback.duration - playback.position) * 1_000 + 350))
          }
        }
      } catch (error) {
        if (!stopped) {
          if (error instanceof SpotifyApiError && error.status === 403) {
            callbacks.current.onError('Spotify denied playback sync. Reconnect or check your app access.')
            wait = document.hidden ? 60_000 : 30_000
          } else if (error instanceof SpotifyApiError && error.status === 429) {
            wait = Math.max(30_000, getSpotifyRateLimitUntil() - Date.now() + 1_000)
          } else {
            wait = document.hidden ? 60_000 : 30_000
          }
        }
      } finally {
        pending = false
        if (!stopped) timer = window.setTimeout(poll, wait)
      }
    }

    const refresh = () => {
      if (pending) return
      window.clearTimeout(timer)
      void poll()
    }
    pollNow.current = refresh
    const onVisible = () => { if (!document.hidden) refresh() }

    void poll()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      pollNow.current = () => {}
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [ready])

  return () => pollNow.current()
}
