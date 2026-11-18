import { useEffect, useRef } from 'react'
import { getSpotifyActivePlayback, SpotifyApiError, type SpotifyActivePlayback } from './spotify'

/** Keep the open page aligned with the account's active Spotify Connect device. */
export function useSpotifyFollow(
  ready: boolean,
  intervalMs: number,
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
    let rateLimitFailures = 0

    const poll = async () => {
      if (stopped || pending) return
      pending = true
      let wait = document.hidden ? 60_000 : intervalMs
      try {
        const playback = await getSpotifyActivePlayback()
        if (!stopped) {
          rateLimitFailures = 0
          callbacks.current.onError(null)
          callbacks.current.onPlayback(playback)
          if (!playback || !playback.playing) wait = document.hidden ? 60_000 : Math.max(15_000, intervalMs)
        }
      } catch (error) {
        if (!stopped) {
          if (error instanceof SpotifyApiError && error.status === 403) {
            callbacks.current.onError('Spotify denied playback sync. Reconnect or check your app access.')
            wait = 30_000
          } else if (error instanceof SpotifyApiError && error.status === 429) {
            callbacks.current.onError(error.message)
            rateLimitFailures += 1
            wait = error.retryAt
              ? Math.max(3_000, error.retryAt - Date.now() + 1_000)
              : Math.min(15 * 60_000, 30_000 * 2 ** (rateLimitFailures - 1))
          } else {
            wait = 30_000
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
  }, [ready, intervalMs])

  return () => pollNow.current()
}
