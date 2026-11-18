import { useEffect, useRef } from 'react'
import type { Track } from '../types'
import {
  getSpotifySnapshot,
  refreshSpotifyState,
  setSpotifyDeviceVolume,
  spotifyPausePlayback,
  spotifyPlayUri,
  spotifyResumePlayback,
  spotifySeekTo,
  spotifyUnavailableReason,
} from './spotifyPlayer'

type Options = {
  track: Track | null
  playing: boolean
  spotifyReady: boolean
  externalPlayback?: boolean
  holdPlayback?: boolean
  volume: number
  onSource: (source: string) => void
  onTime: (time: number) => void
  onPlayingChange: (playing: boolean) => void
  onDuration: (duration: number) => void
  onEnded: () => void
  onError: (message: string | null) => void
}

/** Spotify, direct audio and the demo share one clock. */
export function useAudioEngine(opts: Options) {
  const cb = useRef(opts)
  const sourceKey = useRef('')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const playingRef = useRef(opts.playing)
  const spotifyStarted = useRef(false)
  const spotifyStartingKey = useRef<string | null>(null)
  const spotifyCommands = useRef<Promise<void>>(Promise.resolve())
  const spotifyPaused = useRef(false)
  const spotifyPosition = useRef(0)
  const spotifyLastPoll = useRef(0)
  const demoTime = useRef(0)

  useEffect(() => { cb.current = opts; playingRef.current = opts.playing })
  useEffect(() => () => { audioRef.current?.pause() }, [])

  const uri = opts.track?.spotifyUri
  const audioUrl = opts.track?.audioUrl
  const demo = opts.track?.source === 'demo'
  const key = opts.externalPlayback ? 'external'
    : uri && opts.spotifyReady ? `spotify:${uri}`
      : opts.holdPlayback && opts.track ? `hold:${opts.track.id}`
        : audioUrl ? `audio:${audioUrl}`
          : demo ? `demo:${opts.track?.id}`
            : opts.track ? `none:${opts.track.id}` : ''

  const startSpotify = async (activeKey: string) => {
    if (spotifyStartingKey.current === activeKey || spotifyStarted.current || !activeKey.startsWith('spotify:')) return
    spotifyStartingKey.current = activeKey
    const command = spotifyCommands.current.catch(() => {}).then(async () => {
      if (sourceKey.current !== activeKey || !playingRef.current) return false
      await spotifyPlayUri(activeKey.slice(8), spotifyPosition.current)
      return true
    })
    spotifyCommands.current = command.then(() => {}, () => {})
    try {
      const started = await command
      if (!started || sourceKey.current !== activeKey) return
      spotifyStarted.current = true
      setSpotifyDeviceVolume(cb.current.volume)
      cb.current.onError(null)
      if (!playingRef.current) await spotifyPausePlayback()
    } catch (error) {
      if (sourceKey.current !== activeKey) return
      cb.current.onPlayingChange(false)
      cb.current.onError(error instanceof Error ? error.message : spotifyUnavailableReason() || 'Spotify could not play this song.')
    } finally { if (spotifyStartingKey.current === activeKey) spotifyStartingKey.current = null }
  }

  useEffect(() => {
    if (key === sourceKey.current) return
    const previous = sourceKey.current
    sourceKey.current = key
    cb.current.onSource(key)
    cb.current.onError(null)
    if (previous.startsWith('spotify:') && key !== 'external' && !key.startsWith('spotify:')) void spotifyPausePlayback()
    audioRef.current?.pause()
    spotifyStarted.current = false
    spotifyStartingKey.current = null
    spotifyPaused.current = false
    spotifyPosition.current = 0
    demoTime.current = 0

    if (key === 'external') return
    cb.current.onTime(0)
    cb.current.onDuration(opts.track?.duration || 0)
    if (key.startsWith('spotify:')) {
      if (playingRef.current) void startSpotify(key)
      return
    }
    if (key.startsWith('audio:') && audioUrl) {
      const audio = new Audio(audioUrl)
      audioRef.current = audio
      audio.volume = cb.current.volume / 100
      audio.onloadedmetadata = () => { if (audioRef.current === audio) cb.current.onDuration(Number.isFinite(audio.duration) ? audio.duration : 0) }
      audio.ontimeupdate = () => { if (audioRef.current === audio) cb.current.onTime(audio.currentTime) }
      audio.onended = () => { if (audioRef.current === audio) { cb.current.onPlayingChange(false); cb.current.onEnded() } }
      audio.onerror = () => { if (audioRef.current === audio) { cb.current.onError('Audio source unavailable.'); cb.current.onPlayingChange(false) } }
      audio.load()
      if (playingRef.current) void audio.play().catch(() => {
        cb.current.onPlayingChange(false)
        cb.current.onError('Press play to start audio.')
      })
      return
    }
    if (key.startsWith('none:') && playingRef.current) {
      cb.current.onPlayingChange(false)
      cb.current.onError('No playable source is available. Connect Spotify in Settings.')
    }
  }, [key, audioUrl, opts.track?.duration])

  useEffect(() => {
    if (key.startsWith('spotify:')) setSpotifyDeviceVolume(opts.volume)
    if (audioRef.current) audioRef.current.volume = opts.volume / 100
  }, [opts.volume, key])

  useEffect(() => {
    if (key.startsWith('spotify:')) {
      if (!opts.playing) {
        if (spotifyStarted.current) {
          spotifyPaused.current = true
          void spotifyPausePlayback()
        }
      } else if (!spotifyStarted.current) {
        void startSpotify(key)
      } else if (spotifyPaused.current) {
        spotifyPaused.current = false
        void spotifyResumePlayback().catch((error) => {
          cb.current.onPlayingChange(false)
          cb.current.onError(error instanceof Error ? error.message : 'Spotify could not resume playback.')
        })
      }
      return
    }
    if (key.startsWith('audio:') && audioRef.current) {
      if (opts.playing) void audioRef.current.play().catch(() => {
        cb.current.onPlayingChange(false)
        cb.current.onError('Press play to start audio.')
      })
      else audioRef.current.pause()
    }
  }, [opts.playing, key])

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(.5, Math.max(0, (now - last) / 1000))
      last = now
      const activeKey = sourceKey.current
      if (activeKey.startsWith('spotify:')) {
        if (now - spotifyLastPoll.current > 900) { spotifyLastPoll.current = now; refreshSpotifyState() }
        const state = getSpotifySnapshot()
        if (state?.uri === activeKey.slice(8)) {
          const position = Math.min(state.duration || Infinity, state.position + (state.paused ? 0 : (now - state.at) / 1000))
          spotifyPosition.current = position
          cb.current.onTime(position)
          if (state.duration > 0) cb.current.onDuration(state.duration)
          if (state.paused && playingRef.current && spotifyStartingKey.current !== activeKey && !spotifyPaused.current && position >= state.duration - 1) {
            cb.current.onPlayingChange(false)
            cb.current.onEnded()
          }
        }
      } else if (activeKey.startsWith('demo:') && playingRef.current) {
        demoTime.current += dt
        const duration = cb.current.track?.duration || 0
        if (duration > 0 && demoTime.current >= duration) {
          demoTime.current = duration
          cb.current.onPlayingChange(false)
          cb.current.onEnded()
        }
        cb.current.onTime(demoTime.current)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  const seek = (time: number) => {
    cb.current.onTime(time)
    const activeKey = sourceKey.current
    if (activeKey.startsWith('spotify:')) { spotifyPosition.current = time; void spotifySeekTo(time) }
    else if (activeKey.startsWith('audio:') && audioRef.current) audioRef.current.currentTime = time
    else if (activeKey.startsWith('demo:')) demoTime.current = time
  }

  return { seek }
}
