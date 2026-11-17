import { useEffect, useRef } from 'react'
import type { Track } from '../types'
import { loadYouTubeApi } from './audio'

type Options = {
  track: Track | null
  playing: boolean
  onTime: (t: number) => void
  onPlayingChange: (playing: boolean) => void
  onDuration: (duration: number) => void
  onEnded: () => void
  onError: (message: string | null) => void
}

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

  useEffect(() => { playingRef.current = opts.playing }, [opts.playing])

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
    }
  }, [])

  const ytId = opts.track?.youtubeId
  const audioUrl = opts.track?.audioUrl
  const isDemo = opts.track?.source === 'demo'

  useEffect(() => {
    const track = opts.track
    const key = ytId ? `yt:${ytId}` : audioUrl ? `audio:${audioUrl}` : track ? `none:${track.id}` : ''
    if (key === sourceKey.current) return
    sourceKey.current = key
    cb.current.onError(null)
    simulate.current = false

    if (playerRef.current) {
      suppressPause.current = true
      setTimeout(() => { suppressPause.current = false }, 800)
      try { playerRef.current.pauseVideo?.() } catch { /* ignore */ }
    }
    audioRef.current?.pause()

    if (ytId) {
      audioRef.current?.removeAttribute('src')
      pendingYt.current = ytId
      cb.current.onTime(0)
      cb.current.onDuration(0)
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
        if (lifetime.current !== life || sourceKey.current !== key) return
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
                try { e.target.getIFrame?.().setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture') } catch { /* ignore */ }
                const id = pendingYt.current
                if (!id) return
                if (playingRef.current) e.target.loadVideoById(id)
                else e.target.cueVideoById(id)
              },
              onStateChange: (e: any) => {
                if (e.data === 1) {
                  cb.current.onPlayingChange(true)
                  cb.current.onDuration(e.target.getDuration() || 0)
                } else if (e.data === 2) {
                  if (!suppressPause.current) cb.current.onPlayingChange(false)
                } else if (e.data === 0) {
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
          if (playingRef.current) playerRef.current.loadVideoById(ytId)
          else playerRef.current.cueVideoById(ytId)
        }
      })()
      return
    }

    if (audioUrl) {
      pendingYt.current = null
      if (!audioRef.current) {
        const el = new Audio()
        el.preload = 'auto'
        audioRef.current = el
      }
      const el = audioRef.current
      el.src = audioUrl
      el.onloadedmetadata = () => cb.current.onDuration(el.duration || 0)
      el.onended = () => { cb.current.onPlayingChange(false); cb.current.onEnded() }
      el.onerror = () => { cb.current.onError('Audio source unavailable.'); cb.current.onPlayingChange(false) }
      el.load()
      cb.current.onTime(0)
      cb.current.onDuration(0)
      if (playingRef.current) {
        el.play().catch(() => {
          cb.current.onPlayingChange(false)
          cb.current.onError('Press play to start audio.')
        })
      }
      return
    }

    pendingYt.current = null
    audioRef.current?.removeAttribute('src')
    cb.current.onTime(0)
    cb.current.onDuration(0)
    if (isDemo) { simulate.current = true; simTime.current = 0 }
  }, [ytId, audioUrl, isDemo, opts.track])

  useEffect(() => {
    const player = playerRef.current
    const audio = audioRef.current
    if (opts.playing) {
      if (player?.playVideo && playerReady.current && sourceKey.current.startsWith('yt:')) player.playVideo()
      if (audio?.src && sourceKey.current.startsWith('audio:')) {
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
      const player = playerRef.current
      const audio = audioRef.current
      if (sourceKey.current.startsWith('yt:') && player && playerReady.current) {
        const t = player.getCurrentTime?.()
        if (typeof t === 'number') cb.current.onTime(t)
        const d = player.getDuration?.()
        if (typeof d === 'number' && d > 0) cb.current.onDuration(d)
      } else if (sourceKey.current.startsWith('audio:') && audio?.src) {
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
    if (sourceKey.current.startsWith('yt:')) {
      try { playerRef.current?.seekTo?.(t, true) } catch { /* ignore */ }
    } else if (sourceKey.current.startsWith('audio:')) {
      if (audioRef.current) audioRef.current.currentTime = t
    } else if (simulate.current) {
      simTime.current = t
    }
  }

  return { seek }
}
