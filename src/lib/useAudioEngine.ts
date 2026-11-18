import { useEffect, useRef } from 'react'
import type { AdState, Track } from '../types'
import { loadYouTubeApi } from './audio'
import {
  blockSpotifyUri,
  canUseSpotifyPlayback,
  connectSpotifyDevice,
  getSpotifySnapshot,
  isSpotifyUriBlocked,
  refreshSpotifyState,
  setSpotifyDeviceVolume,
  spotifyPausePlayback,
  spotifyPlayUri,
  spotifySeekTo,
} from './spotifyPlayer'

type Options = {
  track: Track | null
  playing: boolean
  spotifyReady: boolean
  /** Show an external Spotify device without starting local audio. */
  externalPlayback?: boolean
  /** Hold audio until the app has chosen between Spotify and YouTube. */
  holdPlayback?: boolean
  volume: number
  onSource: (source: string) => void
  onTime: (t: number) => void
  onPlayingChange: (playing: boolean) => void
  onDuration: (duration: number) => void
  onEnded: () => void
  onError: (message: string | null) => void
  onAd?: (ad: AdState | null) => void
  onFallback?: (message: string, track: Track | null) => void
}

/** YouTube ads are short; a "video" this short while the real track is long is an ad. */
const AD_MAX_SECONDS = 90
/** An ad that hides its length gets the benefit of the doubt for this long. */
const AD_UNKNOWN_MAX_MS = 20_000
/** A playing video with no duration yet is treated as an ad after this long. */
const AD_SETTLE_MS = 1_200

const roundAd = (n: number) => Math.round(n * 10) / 10

export function useAudioEngine(opts: Options) {
  const cb = useRef(opts)
  useEffect(() => { cb.current = opts })

  const hostRef = useRef<HTMLDivElement | null>(null)
  const playerRef = useRef<any>(null)
  const playerReady = useRef(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const pendingYt = useRef<string | null>(null)
  const suppressPause = useRef(false)
  const sourceKey = useRef('')
  const playingRef = useRef(opts.playing)
  const simulate = useRef(false)
  const simTime = useRef(0)
  const lifetime = useRef(0)

  const adRef = useRef<AdState | null>(null)
  const adStartedAt = useRef(0)
  const lastRealDuration = useRef(0)
  const zeroDurationSince = useRef(0)
  const expectedDuration = useRef(0)

  const spPosition = useRef(0)
  const spPausedByUser = useRef(false)
  const spStarted = useRef(false)
  const spReady = useRef(false)
  const spStarting = useRef(false)
  const spEnded = useRef(false)
  const spLastPoll = useRef(0)

  useEffect(() => { playingRef.current = opts.playing }, [opts.playing])

  const publishAd = (next: AdState | null) => {
    const previous = adRef.current
    if (!next && !previous) return
    if (next && previous && next.total === previous.total && Math.abs(next.remaining - previous.remaining) < 0.05) return
    adRef.current = next
    cb.current.onAd?.(next)
  }

  useEffect(() => {
    lifetime.current += 1
    const host = document.createElement('div')
    host.setAttribute('aria-hidden', 'true')
    host.style.cssText = 'position:fixed;left:-10000px;top:0;width:320px;height:180px;opacity:0;pointer-events:none'
    document.body.appendChild(host)
    hostRef.current = host
    return () => {
      try { playerRef.current?.destroy?.() } catch { /* ignore */ }
      playerRef.current = null
      playerReady.current = false
      pendingYt.current = null
      sourceKey.current = ''
      audioRef.current?.pause()
      audioRef.current = null
      host.remove()
      void spotifyPausePlayback()
    }
  }, [])

  const spotifyUri = opts.track?.spotifyUri
  const ytId = opts.track?.youtubeId
  const audioUrl = opts.track?.audioUrl
  const isDemo = opts.track?.source === 'demo'
  const hold = !!opts.holdPlayback

  useEffect(() => {
    const track = opts.track
    const spotifyAllowed = !!track?.spotifyUri && canUseSpotifyPlayback() && !isSpotifyUriBlocked(track.spotifyUri)
    const key = opts.externalPlayback ? 'external' : spotifyAllowed
      ? `spotify:${track!.spotifyUri}`
      : ytId ? `yt:${ytId}`
        : audioUrl ? `audio:${audioUrl}`
          : hold && track ? `hold:${track.id}`
            : track ? `none:${track.id}`
              : ''
    if (key === sourceKey.current) return
    const previous = sourceKey.current
    sourceKey.current = key
    cb.current.onSource(key)

    cb.current.onError(null)
    publishAd(null)
    adStartedAt.current = 0
    lastRealDuration.current = 0
    zeroDurationSince.current = 0
    expectedDuration.current = track?.duration || 0
    spPosition.current = 0
    spPausedByUser.current = false
    spStarted.current = false
    spReady.current = false
    spStarting.current = false
    spEnded.current = false
    simulate.current = false

    if (previous.startsWith('spotify:') && !key.startsWith('spotify:')) void spotifyPausePlayback()
    if (playerRef.current) {
      suppressPause.current = true
      setTimeout(() => { suppressPause.current = false }, 800)
      try { playerRef.current.pauseVideo?.() } catch { /* ignore */ }
    }
    audioRef.current?.pause()

    const startYouTube = (id: string) => {
      sourceKey.current = `yt:${id}`
      cb.current.onSource(sourceKey.current)
      pendingYt.current = id
      audioRef.current?.removeAttribute('src')
      cb.current.onTime(0)
      cb.current.onDuration(track?.duration || expectedDuration.current || 0)
      const life = lifetime.current
      ;(async () => {
        let YT: any
        try {
          YT = await loadYouTubeApi()
        } catch {
          cb.current.onPlayingChange(false)
          cb.current.onError('Could not load the YouTube player.')
          return
        }
        if (lifetime.current !== life || sourceKey.current !== `yt:${id}`) return
        if (!playerRef.current) {
          const mount = document.createElement('div')
          hostRef.current?.appendChild(mount)
          playerRef.current = new YT.Player(mount, {
            width: 320,
            height: 180,
            playerVars: { autoplay: 0, controls: 0, disablekb: 1, modestbranding: 1, rel: 0, playsinline: 1, origin: window.location.origin },
            events: {
              onReady: (e: any) => {
                playerReady.current = true
                try { e.target.setVolume?.(cb.current.volume) } catch { /* ignore */ }
                try { e.target.getIFrame?.().setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture') } catch { /* ignore */ }
                const queued = pendingYt.current
                if (!queued) return
                if (playingRef.current) e.target.loadVideoById(queued)
                else e.target.cueVideoById(queued)
              },
              onStateChange: (e: any) => {
                if (e.data === 1) {
                  cb.current.onPlayingChange(true)
                  cb.current.onDuration(e.target.getDuration?.() || 0)
                } else if (e.data === 2) {
                  if (!suppressPause.current) cb.current.onPlayingChange(false)
                } else if (e.data === 0) {
                  publishAd(null)
                  cb.current.onPlayingChange(false)
                  cb.current.onEnded()
                }
              },
              onError: () => {
                cb.current.onPlayingChange(false)
                cb.current.onError('YouTube could not play this track.')
              },
            },
          })
        } else if (playerReady.current) {
          if (playingRef.current) playerRef.current.loadVideoById(id)
          else playerRef.current.cueVideoById(id)
        }
      })()
    }

    const startAudio = (url: string) => {
      sourceKey.current = `audio:${url}`
      pendingYt.current = null
      if (!audioRef.current) {
        const element = new Audio()
        element.preload = 'auto'
        audioRef.current = element
      }
      cb.current.onSource(sourceKey.current)
      const element = audioRef.current
      element.src = url
      element.onloadedmetadata = () => cb.current.onDuration(element.duration || 0)
      element.onended = () => { cb.current.onPlayingChange(false); cb.current.onEnded() }
      element.onerror = () => { cb.current.onError('Audio source unavailable.'); cb.current.onPlayingChange(false) }
      element.load()
      cb.current.onTime(0)
      cb.current.onDuration(0)
      if (playingRef.current) {
        element.play().catch(() => {
          cb.current.onPlayingChange(false)
          cb.current.onError('Press play to start audio.')
        })
      }
    }

    const fallbackToYoutube = (reason: string, uri: string) => {
      blockSpotifyUri(uri)
      cb.current.onFallback?.(reason, track)
      const latest = cb.current.track
      if (latest?.youtubeId) startYouTube(latest.youtubeId)
      else if (latest?.audioUrl) startAudio(latest.audioUrl)
      else {
        sourceKey.current = `none:${latest?.id || ''}`
        cb.current.onSource(sourceKey.current)
        cb.current.onTime(0)
        cb.current.onDuration(latest?.duration || 0)
      }
    }

    if (key === 'external') {
      pendingYt.current = null
      audioRef.current?.removeAttribute('src')
      return
    }

    if (!track) {
      pendingYt.current = null
      audioRef.current?.removeAttribute('src')
      cb.current.onTime(0)
      cb.current.onDuration(0)
      return
    }

    if (key.startsWith('hold:')) {
      pendingYt.current = null
      audioRef.current?.removeAttribute('src')
      cb.current.onTime(0)
      cb.current.onDuration(track.duration || 0)
      return
    }

    if (key.startsWith('spotify:')) {
      const uri = track.spotifyUri as string
      pendingYt.current = null
      audioRef.current?.removeAttribute('src')
      cb.current.onTime(0)
      cb.current.onDuration(track.duration || 0)
      const life = lifetime.current
      ;(async () => {
        let device: any = null
        try { device = await connectSpotifyDevice() } catch { device = null }
        if (lifetime.current !== life || sourceKey.current !== key) return
        if (!device) {
          fallbackToYoutube('Spotify playback is unavailable — using YouTube for this track.', uri)
          return
        }
        spReady.current = true
        setSpotifyDeviceVolume(cb.current.volume)
        try {
          if (playingRef.current) {
            spStarting.current = true
            await spotifyPlayUri(uri, 0)
            if (lifetime.current !== life || sourceKey.current !== key || !playingRef.current) {
              await spotifyPausePlayback()
              return
            }
            spStarted.current = true
          }
        } catch {
          if (lifetime.current !== life || sourceKey.current !== key) return
          fallbackToYoutube('Spotify could not play this track — using YouTube instead.', uri)
        } finally {
          spStarting.current = false
        }
      })()
      return
    }

    if (key.startsWith('yt:') && ytId) {
      startYouTube(ytId)
      return
    }

    if (key.startsWith('audio:') && audioUrl) {
      startAudio(audioUrl)
      return
    }

    pendingYt.current = null
    audioRef.current?.removeAttribute('src')
    cb.current.onTime(0)
    cb.current.onDuration(0)
    if (isDemo) { simulate.current = true; simTime.current = 0 }
  }, [spotifyUri, ytId, audioUrl, isDemo, hold, opts.track, opts.spotifyReady, opts.externalPlayback])

  useEffect(() => {
    const volume = opts.volume
    const key = sourceKey.current
    if (key.startsWith('yt:')) {
      try { playerRef.current?.setVolume?.(volume) } catch { /* player not ready */ }
    } else if (key.startsWith('spotify:')) {
      setSpotifyDeviceVolume(volume)
    } else if (key.startsWith('audio:') && audioRef.current) {
      audioRef.current.volume = volume / 100
    }
  }, [opts.volume, opts.track, opts.externalPlayback])

  useEffect(() => {
    const key = sourceKey.current
    if (key.startsWith('spotify:')) {
      const uri = key.slice('spotify:'.length)
      if (!opts.playing) {
        spPausedByUser.current = true
        if (spStarted.current) void spotifyPausePlayback()
      } else if (!spStarted.current && spReady.current && !spStarting.current) {
        spStarting.current = true
        void spotifyPlayUri(uri, spPosition.current).then(() => {
          if (sourceKey.current !== key) return
          spStarted.current = true
          if (!playingRef.current) void spotifyPausePlayback()
        }).catch(() => {
          if (sourceKey.current !== key) return
          cb.current.onPlayingChange(false)
          cb.current.onError('Spotify could not play this track. Try again.')
        }).finally(() => { spStarting.current = false })
      } else if (spPausedByUser.current && spStarted.current) {
        spPausedByUser.current = false
        void spotifyPlayUri(uri, spPosition.current).catch(() => {
          cb.current.onError('Spotify could not resume. Press play to try again.')
        })
      }
      return
    }

    const player = playerRef.current
    const audio = audioRef.current
    if (opts.playing) {
      if (player?.playVideo && playerReady.current && key.startsWith('yt:')) player.playVideo()
      if (audio?.src && key.startsWith('audio:')) {
        audio.play().catch(() => {
          cb.current.onPlayingChange(false)
          cb.current.onError('Audio was blocked by the browser. Press play to start.')
        })
      }
    } else {
      if (player?.pauseVideo) player.pauseVideo()
      audio?.pause()
    }
  }, [opts.playing])

  useEffect(() => {
    let raf = 0
    let last = performance.now()

    const tick = (now: number) => {
      const dt = Math.min(0.5, Math.max(0, (now - last) / 1000))
      last = now
      const key = sourceKey.current

      if (key.startsWith('spotify:')) {
        if (now - spLastPoll.current > 900) {
          spLastPoll.current = now
          refreshSpotifyState()
        }
        const snapshot = getSpotifySnapshot()
        if (snapshot?.uri === key.slice('spotify:'.length)) {
          let position = snapshot.position
          if (!snapshot.paused) position += (performance.now() - snapshot.at) / 1000
          if (snapshot.duration > 0) position = Math.min(snapshot.duration, position)
          spPosition.current = position
          cb.current.onTime(position)
          if (snapshot.duration > 0) cb.current.onDuration(snapshot.duration)
          if (!snapshot.paused) {
            spEnded.current = false
          } else if (!spEnded.current && snapshot.duration > 0 && position >= snapshot.duration - 1 && position > 1) {
            spEnded.current = true
            spPausedByUser.current = true
            cb.current.onPlayingChange(false)
            cb.current.onEnded()
          }
        }
      } else if (key.startsWith('yt:') && playerRef.current && playerReady.current) {
        const player = playerRef.current
        const state = player.getPlayerState?.()
        const duration = Number(player.getDuration?.() || 0)
        const current = Number(player.getCurrentTime?.() || 0)
        const expected = expectedDuration.current

        if (!adRef.current) {
          const looksLikeAd = duration > 0 && duration <= AD_MAX_SECONDS && (
            (expected > AD_MAX_SECONDS && duration < expected - 30) ||
            (lastRealDuration.current > AD_MAX_SECONDS && duration < lastRealDuration.current - 30)
          )
          const hiddenLength = state === 1 && duration <= 0 && expected > AD_MAX_SECONDS
          if (hiddenLength && !zeroDurationSince.current) zeroDurationSince.current = now
          else if (!hiddenLength) zeroDurationSince.current = 0

          if (looksLikeAd || (hiddenLength && now - zeroDurationSince.current > AD_SETTLE_MS)) {
            adStartedAt.current = now
            publishAd({ remaining: Math.max(0, duration - current), total: duration })
          }
        }

        if (adRef.current) {
          const currentAd = adRef.current
          const finished =
            duration > AD_MAX_SECONDS ||
            (currentAd.total > 0 && duration > 0 && Math.abs(duration - currentAd.total) > 2) ||
            (currentAd.total === 0 && now - adStartedAt.current > AD_UNKNOWN_MAX_MS)
          if (finished) {
            publishAd(null)
            zeroDurationSince.current = 0
            if (duration > AD_MAX_SECONDS) lastRealDuration.current = duration
            if (current > 0) cb.current.onTime(current)
            if (duration > 0) cb.current.onDuration(duration)
          } else {
            publishAd({ remaining: roundAd(Math.max(0, duration - current)), total: roundAd(duration || currentAd.total) })
          }
        } else {
          if (duration > 0) lastRealDuration.current = duration
          if (Number.isFinite(current)) cb.current.onTime(current)
          if (duration > 0) cb.current.onDuration(duration)
        }
      } else if (key.startsWith('audio:') && audioRef.current?.src) {
        const audio = audioRef.current
        cb.current.onTime(audio.currentTime)
        if (Number.isFinite(audio.duration) && audio.duration > 0) cb.current.onDuration(audio.duration)
      } else if (simulate.current && playingRef.current) {
        const duration = cb.current.track?.duration ?? 0
        simTime.current += dt
        if (duration > 0 && simTime.current >= duration) {
          simTime.current = duration
          cb.current.onTime(duration)
          cb.current.onPlayingChange(false)
          cb.current.onEnded()
        } else {
          cb.current.onTime(simTime.current)
        }
      }
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const seek = (t: number) => {
    cb.current.onTime(t)
    const key = sourceKey.current
    if (key.startsWith('spotify:')) {
      spPosition.current = t
      void spotifySeekTo(t)
    } else if (key.startsWith('yt:')) {
      try { playerRef.current?.seekTo?.(t, true) } catch { /* ignore */ }
    } else if (key.startsWith('audio:')) {
      if (audioRef.current) audioRef.current.currentTime = t
    } else if (simulate.current) {
      simTime.current = t
    }
  }

  return { seek }
}
