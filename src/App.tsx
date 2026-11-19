import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import './App.css'
import { LyricsView } from './components/LyricsView'
import { IdentifyView } from './components/IdentifyView'
import { SearchView } from './components/SearchView'
import { LibraryView } from './components/LibraryView'
import { FullscreenLyrics } from './components/FullscreenLyrics'
import { ProviderSetup } from './components/ProviderSetup'
import type { AppView, Track } from './types'
import { formatTime } from './lib/lyrics'
import { findAudioSource, isPreviewAudioUrl } from './lib/audio'
import { hasBackend } from './lib/api'
import { resolveToTrack } from './lib/lrclib'
import { useAudioEngine } from './lib/useAudioEngine'
import { SoundPanel } from './components/SoundPanel'
import { SettingsView } from './components/SettingsView'
import { MusicDashboard } from './components/MusicDashboard'
import { MusicTimeline } from './components/MusicTimeline'
import { clearListeningHistory, loadListeningHistory, observeListening, saveListeningHistory, type HistoryEntry } from './lib/listeningHistory'
import { DEFAULT_VISUAL_SETTINGS, loadVisualPresets, loadVisualSettings, saveVisualPresets, saveVisualSettings, type VisualPreset } from './lib/visualSettings'
import { useAtmosphere } from './lib/useAtmosphere'
import { FloatingLyricsWidget } from './components/FloatingLyricsWidget'
import { AmbientScreensaver } from './components/AmbientScreensaver'
import { useLiveIdentify, type LiveMatch } from './lib/useLiveIdentify'
import { beginSpotifyLogin, completeSpotifyLogin, disconnectSpotify, findSpotifyTrack, hasSpotifyAuth, setSpotifyClientId, spotifyFetch, type SpotifyActivePlayback } from './lib/spotify'
import { getSpotifyDeviceId, resetSpotifyPlayer, subscribeSpotifyTrackChanges } from './lib/spotifyPlayer'
import { browserFullscreenElement, canUseBrowserFullscreen, exitBrowserFullscreen, requestBrowserFullscreen } from './lib/browserFullscreen'
import { useSpotifyFollow } from './lib/useSpotifyFollow'
import {
  createPlaylist,
  loadPlaylists,
  loadRecentTrackIds,
  loadSavedTracks,
  savePlaylists,
  saveRecentTrackIds,
  saveSavedTracks,
  type Playlist,
} from './lib/playlists'

const DELAY_KEY = 'lf-lyric-delay'
const DELAY_LIMIT = 3000
type RemotePlayback = SpotifyActivePlayback & { trackId: string; at: number }

function loadDelayMs(): number {
  const raw = Number(localStorage.getItem(DELAY_KEY))
  return Number.isFinite(raw) ? Math.max(-DELAY_LIMIT, Math.min(DELAY_LIMIT, Math.round(raw / 100) * 100)) : 0
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim()
}

function sameSong(match: LiveMatch, track: Track): boolean {
  const mt = normalize(match.title)
  const tt = normalize(track.title)
  const ma = normalize(match.artist)
  const ta = normalize(track.artist)
  if (!mt || !tt) return false
  const titleHit = mt === tt || mt.includes(tt) || tt.includes(mt)
  const artistHit = !ma || !ta || ma === ta || ma.includes(ta) || ta.includes(ma) || ta.split(' ').some((w) => w.length > 2 && ma.includes(w))
  return titleHit && artistHit
}

const VIEW_META: Record<AppView, { title: string; subtitle: string }> = {
  search: { title: 'Search', subtitle: '' },
  lyrics: { title: 'Lyrics', subtitle: 'Follow the current song line by line' },
  identify: { title: 'Identify', subtitle: 'Live microphone recognition and lyric health' },
  library: { title: 'Library', subtitle: 'Your playlists and Spotify' },
  settings: { title: 'Settings', subtitle: 'Playback and lyrics' },
  dna: { title: 'Music DNA', subtitle: 'Your listening in this browser' },
  timeline: { title: 'Timeline', subtitle: 'A private record of songs you played here' },
}

function SearchIcon() {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </svg>
  )
}

function IdentifyIcon() {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <rect x="9" y="3.5" width="6" height="11" rx="3" />
      <path d="M6 11a6 6 0 0 0 12 0M12 17v3.5M9 20.5h6" />
    </svg>
  )
}

function LibraryIcon() {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <path d="M4 6.5h16M4 12h16M4 17.5h10" />
    </svg>
  )
}

function LyricsIcon() {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <path d="M5 6h14M5 11h14M5 16h10M5 21h7" />
    </svg>
  )
}

function MoreIcon() {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />
      <circle cx="12" cy="12" r="7.5" />
    </svg>
  )
}

export default function App() {
  const [view, setView] = useState<AppView>('search')
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 640px)').matches)
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)
  const [catalog, setCatalog] = useState<Track[]>(loadSavedTracks)
  const [recentIds, setRecentIds] = useState<string[]>(loadRecentTrackIds)
  const [selectedId, setSelectedId] = useState<string>(() => {
    const saved = loadSavedTracks()
    return loadRecentTrackIds().find((id) => saved.some((track) => track.id === id)) || saved[0]?.id || ''
  })
  const [providerVersion, setProviderVersion] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)
  const [browserFullscreen, setBrowserFullscreen] = useState(false)
  const browserFullscreenRequested = useRef(false)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [audioDuration, setAudioDuration] = useState(0)
  const [audioError, setAudioError] = useState<string | null>(null)
  const [delayMs, setDelayMs] = useState(loadDelayMs)
  const [playlists, setPlaylists] = useState<Playlist[]>(loadPlaylists)
  const [spotifyReady, setSpotifyReady] = useState(hasSpotifyAuth)
  const [spotifyError, setSpotifyError] = useState<string | null>(null)
  const [playbackNotice, setPlaybackNotice] = useState<string | null>(null)
  const [pendingSpotify, setPendingSpotify] = useState<string | null>(null)
  const [connectingSpotify, setConnectingSpotify] = useState(false)
  const [remotePlayback, setRemotePlayback] = useState<RemotePlayback | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [volume, setVolume] = useState(100)
  const [lyricSize, setLyricSize] = useState(() => {
    const saved = Number(localStorage.getItem('lf-lyric-size') || 100)
    return Number.isFinite(saved) ? Math.max(80, Math.min(160, saved)) : 100
  })
  const [autoFullscreen, setAutoFullscreen] = useState(() => localStorage.getItem('lf-auto-fullscreen') !== 'false')
  const [spotifySyncMs, setSpotifySyncMs] = useState(() => {
    const saved = Number(localStorage.getItem('lf-spotify-sync-ms') || 3_000)
    return Number.isFinite(saved) ? Math.max(3_000, Math.min(30_000, saved)) : 3_000
  })
  const [playbackSource, setPlaybackSource] = useState('')
  const [visual, setVisual] = useState(loadVisualSettings)
  const [presets, setPresets] = useState(loadVisualPresets)
  const [history, setHistory] = useState(loadListeningHistory)
  const [screensaver, setScreensaver] = useState(false)
  const remoteVolumeTimer = useRef(0)
  useEffect(() => () => window.clearTimeout(remoteVolumeTimer.current), [])
  const live = useLiveIdentify()

  useEffect(() => {
    const media = window.matchMedia('(max-width: 640px)')
    const onChange = () => {
      setIsMobile(media.matches)
      if (!media.matches) {
        setMobileMoreOpen(false)
        setView((current) => current === 'lyrics' ? 'search' : current)
      }
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const onFullscreenChange = () => {
      const active = Boolean(browserFullscreenElement())
      setBrowserFullscreen(active)
      if (!active && browserFullscreenRequested.current) {
        browserFullscreenRequested.current = false
        setFullscreen(false)
      }
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    document.addEventListener('webkitfullscreenchange', onFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange)
    }
  }, [])

  const openFullscreen = () => {
    if (!selectedId) return
    setFullscreen(true)
    setScreensaver(false)
    if (browserFullscreenElement() || !canUseBrowserFullscreen()) return
    browserFullscreenRequested.current = true
    void requestBrowserFullscreen().catch(() => {
      browserFullscreenRequested.current = false
      setBrowserFullscreen(false)
    })
  }

  const closeFullscreen = () => {
    setFullscreen(false)
    if (browserFullscreenRequested.current && browserFullscreenElement()) {
      void exitBrowserFullscreen().catch(() => {})
    }
    browserFullscreenRequested.current = false
  }

  const selected = useMemo<Track | null>(() => catalog.find((t) => t.id === selectedId) ?? null, [catalog, selectedId])
  const atmosphere = useAtmosphere(selected?.cover)
  const pendingRef = useRef<{ startAt: number; play: boolean } | null>(null)
  const catalogRef = useRef(catalog)
  const resolvingRef = useRef<Set<string>>(new Set())
  const recordedRef = useRef<string | null>(null)
  const remoteRef = useRef<RemotePlayback | null>(null)
  const ignoredRemoteUriRef = useRef<string | null>(null)
  const remoteResolvingRef = useRef<Set<string>>(new Set())

  useEffect(() => { catalogRef.current = catalog }, [catalog])

  const { seek } = useAudioEngine({
    track: selected,
    playing,
    spotifyReady,
    externalPlayback: !!remotePlayback,
    holdPlayback: !!pendingSpotify && pendingSpotify === selectedId && !selected?.spotifyUri,
    volume,
    onSource: setPlaybackSource,
    onTime: (value) => { if (!remoteRef.current) setTime(value) },
    onPlayingChange: (value) => { if (!remoteRef.current) setPlaying(value) },
    onDuration: (value) => { if (!remoteRef.current) setAudioDuration(value) },
    onEnded: () => { if (!remoteRef.current) setPlaying(false) },
    onError: (message) => { if (!remoteRef.current) setAudioError(message) },
  })

  useEffect(() => {
    recordedRef.current = null
    const pend = pendingRef.current
    pendingRef.current = null
    setTime(pend?.startAt ?? 0)
    setPlaying(pend?.play ?? false)
    setAudioDuration(0)
    setAudioError(null)
    setPlaybackNotice(null)
  }, [selectedId])

  useEffect(() => { savePlaylists(playlists) }, [playlists])
  useEffect(() => { saveSavedTracks(catalog) }, [catalog])
  useEffect(() => { saveRecentTrackIds(recentIds) }, [recentIds])
  useEffect(() => { saveVisualSettings(visual) }, [visual])
  useEffect(() => { saveVisualPresets(presets) }, [presets])
  useEffect(() => { saveListeningHistory(history) }, [history])

  useEffect(() => {
    if (!visual.screensaverMinutes || !selectedId || fullscreen) return
    let timer = 0
    const reset = () => {
      setScreensaver(false)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setScreensaver(true), visual.screensaverMinutes * 60_000)
    }
    const events = ['pointermove', 'keydown', 'touchstart', 'click'] as const
    events.forEach((event) => window.addEventListener(event, reset, { passive: true }))
    timer = window.setTimeout(() => setScreensaver(true), visual.screensaverMinutes * 60_000)
    return () => { window.clearTimeout(timer); events.forEach((event) => window.removeEventListener(event, reset)) }
  }, [visual.screensaverMinutes, selectedId, fullscreen])

  useEffect(() => {
    if (!selectedId || !playing) return
    const track = catalogRef.current.find((item) => item.id === selectedId)
    if (!track) return
    let last = performance.now()
    const timer = window.setInterval(() => {
      const now = performance.now()
      const elapsed = Math.min(6, Math.max(0, (now - last) / 1000))
      last = now
      if (elapsed > 0) setHistory((entries) => observeListening(entries, track, elapsed, Date.now()))
    }, 5_000)
    return () => window.clearInterval(timer)
  }, [selectedId, playing])

  const refreshSpotifyPlayback = useSpotifyFollow(spotifyReady, spotifySyncMs, (playback) => {
    if (!playback) {
      ignoredRemoteUriRef.current = null
      if (remoteRef.current) {
        remoteRef.current = null
        setRemotePlayback(null)
        setPlaying(false)
      }
      return
    }
    const ownDevice = getSpotifyDeviceId()
    if (ownDevice && playback.deviceId === ownDevice && !remoteRef.current) return
    if (ignoredRemoteUriRef.current === playback.uri) return
    ignoredRemoteUriRef.current = null

    const existing = catalogRef.current.find((track) => track.spotifyUri === playback.uri)
    const trackId = existing?.id || `spotify-${playback.track.id || playback.uri.split(':').pop()}`
    if (!existing) {
      const base = {
        id: trackId,
        title: playback.track.name,
        artist: playback.track.artists?.map((artist) => artist.name).join(', ') || 'Unknown Artist',
        album: playback.track.album?.name || 'Single',
        duration: playback.duration,
        cover: playback.track.album?.images?.[0]?.url || '',
        source: 'spotify' as const,
        spotifyUri: playback.uri,
        externalUrl: playback.track.external_urls?.spotify,
      }
      const placeholder: Track = { ...base, tags: ['spotify'], lyrics: [{ time: 0, text: 'Loading lyrics…' }] }
      setCatalog((tracks) => tracks.some((track) => track.spotifyUri === playback.uri) ? tracks : [placeholder, ...tracks])
      if (!remoteResolvingRef.current.has(playback.uri)) {
        remoteResolvingRef.current.add(playback.uri)
        void resolveToTrack(base).then((resolved) => {
          setCatalog((tracks) => tracks.map((track) => track.spotifyUri === playback.uri ? { ...resolved, id: track.id } : track))
        }).catch(() => { /* the placeholder remains visible */ })
          .finally(() => remoteResolvingRef.current.delete(playback.uri))
      }
    }

    const previous = remoteRef.current
    if (!previous || previous.uri !== playback.uri) {
      setAudioError(null)
      setPlaybackNotice(null)
    }
    const position = playback.position
    const next: RemotePlayback = { ...playback, position, trackId, at: performance.now() }
    remoteRef.current = next
    setRemotePlayback(next)
    setAudioDuration(playback.duration)
    setPlaying(playback.playing)
    setTime(position)
    if (selectedId !== trackId) {
      pendingRef.current = { startAt: position, play: playback.playing }
      setSelectedId(trackId)
    }
  }, setSyncError)
  useEffect(() => subscribeSpotifyTrackChanges(refreshSpotifyPlayback), [refreshSpotifyPlayback])

  const isFollowing = !!remotePlayback
  useEffect(() => {
    if (!isFollowing) return
    const timer = window.setInterval(() => {
      const current = remoteRef.current
      if (!current || !current.playing) return
      setTime(Math.min(current.duration || Infinity, current.position + (performance.now() - current.at) / 1000))
    }, 100)
    return () => window.clearInterval(timer)
  }, [isFollowing])
  useEffect(() => {
    if (!selected || !playing || time < 0.5 || recordedRef.current === selected.id) return
    recordedRef.current = selected.id
    setRecentIds((ids) => [selected.id, ...ids.filter((id) => id !== selected.id)].slice(0, 20))
  }, [selected, playing, time])

  const spotifyHandled = useRef(false)
  useEffect(() => {
    if (spotifyHandled.current) return
    spotifyHandled.current = true
    completeSpotifyLogin()
      .then((done) => {
        if (!done) return
        resetSpotifyPlayer()
        setSpotifyReady(true)
        setSpotifyError(null)
        setView('settings')
      })
      .catch((e: any) => {
        setSpotifyError(e?.message || 'Spotify login failed.')
        setSpotifyReady(hasSpotifyAuth())
        setView('settings')
      })
  }, [])

  const selectedAudioUrl = selected?.audioUrl
  const selectedSpotifyUri = selected?.spotifyUri

  useEffect(() => {
    if (remotePlayback) return
    const track = catalogRef.current.find((t) => t.id === selectedId)
    if (!track) return

    if ((track.spotifyUri && spotifyReady) || (!spotifyReady && track.audioUrl)) return

    const resolving = resolvingRef.current
    if (resolving.has(track.id)) return
    resolving.add(track.id)
    let cancelled = false

    ;(async () => {
      try {
        if (spotifyReady) {
          const uri = await findSpotifyTrack(track.title, track.artist)
          if (cancelled) return
          if (!uri) throw new Error('This song was not found on Spotify.')
          setCatalog((c) => c.map((t) => (t.id === track.id ? { ...t, spotifyUri: uri } : t)))
          return
        }

        const current = catalogRef.current.find((t) => t.id === track.id) ?? track
        if (current.audioUrl) return
        const src = await findAudioSource(current.title, current.artist)
        if (cancelled) return
        if (!src.audioUrl) throw new Error('No audio preview found. Connect Spotify for full playback.')
        setCatalog((c) => c.map((t) => t.id === track.id ? {
          ...t,
          audioUrl: t.audioUrl ?? src.audioUrl,
          cover: t.cover || src.cover || '',
        } : t))
      } catch (error) {
        if (!cancelled) { setAudioError(error instanceof Error ? error.message : 'Could not start this track.'); setPlaying(false) }
      } finally {
        resolving.delete(track.id)
        if (!cancelled) setPendingSpotify((p) => (p === track.id ? null : p))
      }
    })()

    return () => {
      cancelled = true
      resolving.delete(track.id)
      setPendingSpotify((p) => (p === track.id ? null : p))
    }
  }, [selectedId, selectedSpotifyUri, selectedAudioUrl, providerVersion, spotifyReady, remotePlayback])

  const prepareTrack = (t: Track) => {
    if (!t.spotifyUri && spotifyReady) {
      setPendingSpotify(t.id)
    } else {
      setPendingSpotify(null)
    }
  }

  const openTrack = (t: Track, startAt = 0) => {
    const activeDevice = remoteRef.current?.deviceId
    if (activeDevice && spotifyReady) {
      setPlaybackNotice('Starting on your Spotify device…')
      void (async () => {
        try {
          const uri = t.spotifyUri || await findSpotifyTrack(t.title, t.artist)
          if (!uri) throw new Error('This song was not found on Spotify.')
          await spotifyFetch(`/me/player/play?device_id=${encodeURIComponent(activeDevice)}`, {
            method: 'PUT',
            body: JSON.stringify({ uris: [uri], position_ms: Math.max(0, Math.round(startAt * 1000)) }),
          })
          setCatalog((tracks) => tracks.some((track) => track.id === t.id) ? tracks.map((track) => track.id === t.id ? { ...t, spotifyUri: uri } : track) : [{ ...t, spotifyUri: uri }, ...tracks])
          setPlaybackNotice(null)
          window.setTimeout(refreshSpotifyPlayback, 350)
          window.setTimeout(refreshSpotifyPlayback, 1_200)
        } catch (error) { setPlaybackNotice(error instanceof Error ? error.message : 'Could not start Spotify playback.') }
      })()
      return
    }
    ignoredRemoteUriRef.current = remoteRef.current?.uri || null
    remoteRef.current = null
    setRemotePlayback(null)
    prepareTrack(t)
    setCatalog((c) => c.some((x) => x.id === t.id) ? c.map((x) => x.id === t.id ? t : x) : [t, ...c])
    if (t.id === selectedId) {
      pendingRef.current = null
      seek(startAt)
      setPlaying(true)
      if (autoFullscreen && !isMobile) setFullscreen(true)
      return
    }
    pendingRef.current = { startAt, play: true }
    setTime(0)
    setSelectedId(t.id)
    if (autoFullscreen && !isMobile) setFullscreen(true)
  }

  const currentIndex = catalog.findIndex((t) => t.id === selectedId)
  const next = () => {
    if (remoteRef.current) {
      void spotifyFetch('/me/player/next', { method: 'POST' })
        .then(() => { window.setTimeout(refreshSpotifyPlayback, 400); window.setTimeout(refreshSpotifyPlayback, 1_500) })
        .catch((error) => setPlaybackNotice(error?.message || 'Could not skip on Spotify.'))
      return
    }
    if (!catalog.length) return
    const target = catalog[(currentIndex + 1 + catalog.length) % catalog.length]
    prepareTrack(target)
    pendingRef.current = { startAt: 0, play: playing }
    setTime(0)
    setSelectedId(target.id)
  }
  const prev = () => {
    if (remoteRef.current) {
      void spotifyFetch('/me/player/previous', { method: 'POST' })
        .then(() => { window.setTimeout(refreshSpotifyPlayback, 400); window.setTimeout(refreshSpotifyPlayback, 1_500) })
        .catch((error) => setPlaybackNotice(error?.message || 'Could not skip on Spotify.'))
      return
    }
    if (!catalog.length) return
    const target = catalog[(currentIndex - 1 + catalog.length) % catalog.length]
    prepareTrack(target)
    pendingRef.current = { startAt: 0, play: playing }
    setTime(0)
    setSelectedId(target.id)
  }

  const onProvidersSaved = () => {
    // Previews are 30 seconds long, so drop them and resolve again with the new provider.
    setCatalog((c) => c.map((t) => (isPreviewAudioUrl(t.audioUrl) ? { ...t, audioUrl: undefined } : t)))
    setProviderVersion((v) => v + 1)
  }

  const updateDelay = (ms: number) => {
    const next = Math.max(-DELAY_LIMIT, Math.min(DELAY_LIMIT, Math.round(ms / 100) * 100))
    setDelayMs(next)
    localStorage.setItem(DELAY_KEY, String(next))
  }

  const connectSpotify = async (clientId?: string) => {
    setSpotifyError(null)
    setConnectingSpotify(true)
    try {
      if (clientId !== undefined) setSpotifyClientId(clientId)
      await beginSpotifyLogin()
    } catch (e: any) {
      setSpotifyError(e?.message || 'Could not connect to Spotify.')
      setConnectingSpotify(false)
      setView('settings')
    }
  }

  const onSpotifyReadyChange = (ready: boolean) => {
    setSpotifyReady(ready)
    if (ready) return
    if (remoteRef.current) setPlaying(false)
    remoteRef.current = null
    setRemotePlayback(null)
    setSyncError(null)
  }

  const disconnectSpotifyAccount = () => {
    resetSpotifyPlayer()
    disconnectSpotify()
    onSpotifyReadyChange(false)
  }

  const onCreatePlaylist = (name: string) => {
    const playlist = createPlaylist(name)
    setPlaylists((list) => [...list, playlist])
    return playlist
  }
  const onDeletePlaylist = (id: string) => setPlaylists((list) => list.filter((p) => p.id !== id))
  const addToPlaylist = (playlistId: string, trackId: string) => {
    setPlaylists((list) => list.map((p) => p.id === playlistId && !p.trackIds.includes(trackId) ? { ...p, trackIds: [...p.trackIds, trackId] } : p))
  }
  const removeFromPlaylist = (playlistId: string, trackId: string) => {
    setPlaylists((list) => list.map((p) => p.id === playlistId ? { ...p, trackIds: p.trackIds.filter((id) => id !== trackId) } : p))
  }

  const playbackDuration = audioDuration || selected?.duration || 0

  const updateVolume = (value: number) => {
    setVolume(value)
    if (remoteRef.current?.deviceId) {
      window.clearTimeout(remoteVolumeTimer.current)
      const deviceId = remoteRef.current.deviceId
      remoteVolumeTimer.current = window.setTimeout(() => {
        void spotifyFetch(`/me/player/volume?volume_percent=${value}&device_id=${encodeURIComponent(deviceId)}`, { method: 'PUT' })
          .catch((error) => setPlaybackNotice(error?.message || 'Could not change the phone volume.'))
      }, 400)
    }
  }

  const updateLyricSize = (value: number) => {
    setLyricSize(value)
    localStorage.setItem('lf-lyric-size', String(value))
  }
  const updateAutoFullscreen = (value: boolean) => {
    setAutoFullscreen(value)
    localStorage.setItem('lf-auto-fullscreen', String(value))
  }
  const updateSpotifySync = (value: number) => {
    setSpotifySyncMs(value)
    localStorage.setItem('lf-spotify-sync-ms', String(value))
  }
  const updateVisual = (patch: Partial<typeof visual>) => setVisual((current) => ({ ...current, ...patch }))
  const savePreset = (name: string) => setPresets((items) => [...items.filter((item) => item.name.toLowerCase() !== name.toLowerCase()), { name, settings: visual }].slice(-12))
  const applyPreset = (preset: VisualPreset) => setVisual(preset.settings)
  const deletePreset = (name: string) => setPresets((items) => items.filter((item) => item.name !== name))
  const resetVisual = () => setVisual(DEFAULT_VISUAL_SETTINGS)
  const clearHistory = () => { clearListeningHistory(); setHistory([]) }

  const openHistory = async (entry: HistoryEntry) => {
    try {
      const track = await resolveToTrack({ id: entry.trackId, title: entry.title, artist: entry.artist,
        album: entry.album, cover: entry.cover, source: entry.source, spotifyUri: entry.spotifyUri,
        externalUrl: entry.externalUrl })
      openTrack(track)
    } catch { setPlaybackNotice('Could not reopen this song right now.') }
  }

  useEffect(() => {
    document.documentElement.style.setProperty('--lyrics-scale', String(lyricSize / 100))
  }, [lyricSize])

  const appStyle = {
    '--atmo-a': atmosphere.primary,
    '--atmo-b': atmosphere.secondary,
    '--theme-blur': `${visual.blur}px`,
    '--theme-opacity': String(visual.transparency / 100),
    '--artwork-image': selected?.cover?.startsWith('http') ? `url(${JSON.stringify(selected.cover)})` : 'none',
  } as CSSProperties

  const togglePlayback = () => {
    const remote = remoteRef.current
    if (!remote) { setPlaying((value) => !value); return }
    const next = { ...remote, playing: !remote.playing, position: time, at: performance.now() }
    remoteRef.current = next
    setRemotePlayback(next)
    setPlaying(next.playing)
    void spotifyFetch(next.playing ? '/me/player/play' : '/me/player/pause', { method: 'PUT' })
      .catch((error) => {
        remoteRef.current = remote
        setRemotePlayback(remote)
        setPlaying(remote.playing)
        setPlaybackNotice(error?.message || 'Could not control Spotify on this device.')
      })
  }

  const seekPlayback = (seconds: number) => {
    const remote = remoteRef.current
    if (!remote) { seek(seconds); return }
    const next = { ...remote, position: seconds, at: performance.now() }
    remoteRef.current = next
    setRemotePlayback(next)
    setTime(seconds)
    void spotifyFetch(`/me/player/seek?position_ms=${Math.max(0, Math.round(seconds * 1000))}`, { method: 'PUT' })
      .catch((error) => setPlaybackNotice(error?.message || 'Could not seek on Spotify.'))
  }

  const liveHealth = useMemo(() => {
    if (!selected) return null
    const recent = live.matches.slice(0, 6)
    if (!recent.length) return null
    return Math.round((100 * recent.filter((m) => sameSong(m, selected)).length) / recent.length)
  }, [live.matches, selected])

  const meta = VIEW_META[view]
  const chooseMobileView = (next: AppView) => {
    setView(next)
    setMobileMoreOpen(false)
    window.scrollTo(0, 0)
  }

  return (
    <div className={`app theme-${visual.background} font-${visual.font} align-${visual.align} position-${visual.position} highlight-${visual.highlight} word-${visual.wordAnimation}${visual.animations ? '' : ' no-motion'}`} style={appStyle}>
      <div className="shell" inert={fullscreen} aria-hidden={fullscreen}>
        <aside className="panel sidebar">
          <div className="brand" aria-label="LyricFlow">
            <span className="brand-mark" aria-hidden="true"><span /><span /><span /><span /></span>
            <span className="brand-name">Lyric<span>Flow</span><small>Music, in focus</small></span>
          </div>
          <div className="sidebar-label">Discover</div>
          <nav className="nav" aria-label="Main">
            <button className={view === 'search' ? 'active' : ''} onClick={() => setView('search')}>
              <SearchIcon />
              <span>Search</span>
            </button>
            <button className={view === 'identify' ? 'active' : ''} onClick={() => setView('identify')}>
              <IdentifyIcon />
              <span>Identify</span>
            </button>
            <button className={view === 'library' ? 'active' : ''} onClick={() => setView('library')}>
              <LibraryIcon />
              <span>Library</span>
            </button>
            <button className={view === 'dna' ? 'active' : ''} onClick={() => setView('dna')}>
              <span className="nav-icon" aria-hidden="true">◉</span><span>Music DNA</span>
            </button>
            <button className={view === 'timeline' ? 'active' : ''} onClick={() => setView('timeline')}>
              <span className="nav-icon" aria-hidden="true">◷</span><span>Timeline</span>
            </button>
            <button className={view === 'settings' ? 'active' : ''} onClick={() => setView('settings')}>
              <SettingsIcon />
              <span>Settings</span>
            </button>
          </nav>

          <div className="sidebar-foot">
            <p className="production">LYRICFLOW / 2026</p>
          </div>
        </aside>

        <main className={`panel main${isMobile && view === 'lyrics' ? ' main-lyrics-mobile' : ''}`}>
          <div className="main-header">
            <div>
              <h1>{meta.title}</h1>
              {meta.subtitle && <div className="muted small">{meta.subtitle}</div>}
            </div>
            {spotifyReady && <span className="spotify-chip"><span className="spotify-dot" aria-hidden="true" />{remotePlayback ? `Following ${remotePlayback.deviceName}` : 'Spotify connected'}</span>}
          </div>
          <div className="main-body">
            {isMobile && (syncError || audioError || playbackNotice) && (
              <div className="mobile-notices">
                {syncError && <div className="notice error">{syncError}</div>}
                {audioError && <div className="notice error">{audioError}</div>}
                {playbackNotice && <div className="notice">{playbackNotice}</div>}
              </div>
            )}
            <div className="view-enter" key={view}>
            {view === 'lyrics' ? (
              <div className="mobile-lyrics-panel">
                <LyricsView track={selected} currentTime={time} duration={playbackDuration} delayMs={delayMs} onOpenFullscreen={openFullscreen} playlists={playlists} onAdd={addToPlaylist} onCreate={onCreatePlaylist} />
              </div>
            ) : view === 'identify' ? (
              <IdentifyView live={live} currentTrack={selected} health={liveHealth} onOpen={openTrack} />
            ) : view === 'search' ? (
              <SearchView onOpen={openTrack} recentTracks={recentIds.map((id) => catalog.find((track) => track.id === id)).filter((track): track is Track => !!track)} />
            ) : view === 'settings' ? (
              <SettingsView isMobile={isMobile} volume={volume} onVolumeChange={updateVolume} delayMs={delayMs} onDelayChange={updateDelay}
                lyricSize={lyricSize} onLyricSizeChange={updateLyricSize}
                autoFullscreen={autoFullscreen} onAutoFullscreenChange={updateAutoFullscreen}
                spotifyConnected={spotifyReady} spotifyConnecting={connectingSpotify} spotifyError={spotifyError}
                spotifyDeviceName={remotePlayback?.deviceName} onSpotifyConnect={(id) => void connectSpotify(id)}
                onSpotifyDisconnect={disconnectSpotifyAccount} onDismissSpotifyError={() => setSpotifyError(null)} onSpotifyTransferred={() => window.setTimeout(refreshSpotifyPlayback, 600)}
                spotifySyncMs={spotifySyncMs} onSpotifySyncChange={updateSpotifySync}
                visual={visual} presets={presets} onVisualChange={updateVisual} onSavePreset={savePreset}
                onApplyPreset={applyPreset} onDeletePreset={deletePreset} onResetVisual={resetVisual} onClearHistory={clearHistory} />
            ) : view === 'dna' ? (
              <MusicDashboard history={history} onOpen={(entry) => void openHistory(entry)} />
            ) : view === 'timeline' ? (
              <MusicTimeline history={history} onOpen={(entry) => void openHistory(entry)} />
            ) : (
              <LibraryView
                playlists={playlists}
                catalog={catalog}
                currentTrack={selected}
                onOpen={openTrack}
                onCreate={onCreatePlaylist}
                onDelete={onDeletePlaylist}
                onAddTrack={addToPlaylist}
                onRemoveTrack={removeFromPlaylist}
                spotifyReady={spotifyReady}
                onSpotifyReadyChange={onSpotifyReadyChange}
                spotifyError={spotifyError}
                onDismissSpotifyError={() => setSpotifyError(null)}
                onOpenSettings={() => setView('settings')}
              />
            )}
            </div>
          </div>
        </main>

        <aside className={`panel rightbar${isMobile && view === 'settings' ? ' mobile-settings' : ''}`}>
          {syncError && <div className="notice error" style={{ margin: '4px 10px 0' }}>{syncError} {!syncError.startsWith('Spotify returned 429') && <button className="link" onClick={() => setView('settings')}>Connection settings</button>}</div>}
          {audioError && <div className="notice error" style={{ margin: '4px 10px 0' }}>{audioError}</div>}
          {playbackNotice && <div className="notice" style={{ margin: '4px 10px 0' }}>{playbackNotice}</div>}
          {selected && playbackSource.startsWith('audio:') && isPreviewAudioUrl(selected.audioUrl) && (
            <div className="notice" style={{ margin: '4px 10px 0' }}>
              Playing a short preview. Connect Spotify (Premium) for full playback.
            </div>
          )}
          {!hasBackend && <ProviderSetup onSaved={onProvidersSaved} />}
          {!isMobile && <LyricsView track={selected} currentTime={time} duration={playbackDuration} delayMs={delayMs} onOpenFullscreen={openFullscreen} playlists={playlists} onAdd={addToPlaylist} onCreate={onCreatePlaylist} />}
          <SoundPanel source={playbackSource} track={selected} remoteDevice={remotePlayback?.deviceName} remoteDeviceType={remotePlayback?.deviceType}
            volume={volume} position={time} duration={playbackDuration} playing={playing} onVolumeChange={updateVolume} onRefresh={refreshSpotifyPlayback} />
        </aside>
      </div>

      <footer className="panel player" inert={fullscreen} aria-hidden={fullscreen}>
        <div className="now-playing">
          <div className="mini-cover" key={selected?.id || 'empty'} style={{ background: selected?.cover?.startsWith('http') ? `url(${selected.cover}) center/cover` : (selected?.cover || 'var(--panel-2)') }} />
          <div className="np-meta">
            <div className="t">{selected?.title ?? 'Nothing playing'}</div>
            <div className="a">{selected ? `${selected.artist} • ${selected.album}` : 'Search a song to start'}</div>
            {remotePlayback && <div className="remote-label">Playing on {remotePlayback.deviceName} · lyrics follow here</div>}
          </div>
        </div>
        <div className="transport">
          <div className="controls">
            <button className="icon-btn" onClick={prev} title="Previous">⏮</button>
            <button className="icon-btn play" onClick={togglePlayback} disabled={!selected} title="Play/Pause">{playing ? '❚❚' : '▶'}</button>
            <button className="icon-btn" onClick={next} title="Next">⏭</button>
          </div>
          <div className="progress">
            <span>{formatTime(time)}</span>
            <input className="range" type="range" min={0} max={playbackDuration || 300} step={0.05} value={Math.min(time, playbackDuration || 300)} onChange={(e) => seekPlayback(Number(e.target.value))} />
            <span>{formatTime(playbackDuration)}</span>
          </div>
        </div>
        <div className="extras">
          <label className="delay-control">
            <span>Timing</span>
            <input type="range" min={-3000} max={3000} step={100} value={delayMs}
              onChange={(event) => updateDelay(Number(event.target.value))} aria-label="Lyric timing delay in milliseconds" />
            <output>{delayMs > 0 ? '+' : ''}{delayMs} ms</output>
          </label>
          <button className="btn" onClick={openFullscreen} disabled={!selected}>Fullscreen</button>
        </div>
      </footer>

      <div className="mobile-nav-wrap" inert={fullscreen} aria-hidden={fullscreen}>
        {mobileMoreOpen && (
          <>
            <button className="mobile-more-backdrop" onClick={() => setMobileMoreOpen(false)} aria-label="Close more menu" />
            <div className="mobile-more-menu" id="mobile-more-menu">
              <button onClick={() => chooseMobileView('settings')}><SettingsIcon /> Settings</button>
              <button onClick={() => chooseMobileView('dna')}>Music DNA</button>
              <button onClick={() => chooseMobileView('timeline')}>Timeline</button>
            </div>
          </>
        )}
        <nav className="mobile-nav" aria-label="Mobile navigation">
          <button className={view === 'search' ? 'active' : ''} onClick={() => chooseMobileView('search')}><SearchIcon /><span>Search</span></button>
          <button className={view === 'library' ? 'active' : ''} onClick={() => chooseMobileView('library')}><LibraryIcon /><span>Library</span></button>
          <button className={view === 'lyrics' ? 'active' : ''} onClick={() => chooseMobileView('lyrics')}><LyricsIcon /><span>Lyrics</span></button>
          <button className={view === 'identify' ? 'active' : ''} onClick={() => chooseMobileView('identify')}><IdentifyIcon /><span>Identify</span></button>
          <button className={['settings', 'dna', 'timeline'].includes(view) ? 'active' : ''} onClick={() => setMobileMoreOpen((open) => !open)} aria-expanded={mobileMoreOpen} aria-controls="mobile-more-menu"><MoreIcon /><span>More</span></button>
        </nav>
      </div>

      {visual.widget && !isMobile && selected && !fullscreen && !screensaver && <FloatingLyricsWidget track={selected} time={time} delayMs={delayMs}
        playing={playing} position={visual.widgetPosition} onTogglePlay={togglePlayback} onNext={next} onPrevious={prev}
        onOpenFull={openFullscreen} onClose={() => updateVisual({ widget: false })} />}

      {screensaver && visual.screensaverMinutes > 0 && selected && !fullscreen && <AmbientScreensaver track={selected} time={time} delayMs={delayMs} onExit={() => setScreensaver(false)} />}

      {fullscreen && selected && (
        <FullscreenLyrics
          track={selected}
          currentTime={time}
          duration={playbackDuration}
          playing={playing}
          delayMs={delayMs}
          onDelayChange={updateDelay}
          browserFullscreen={browserFullscreen}
          canEnterBrowserFullscreen={canUseBrowserFullscreen()}
          onEnterBrowserFullscreen={openFullscreen}
          onClose={closeFullscreen}
          onTogglePlay={togglePlayback}
          onSeek={seekPlayback}
        />
      )}
    </div>
  )
}
