import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { LyricsView } from './components/LyricsView'
import { IdentifyView } from './components/IdentifyView'
import { SearchView } from './components/SearchView'
import { LibraryView } from './components/LibraryView'
import { FullscreenLyrics } from './components/FullscreenLyrics'
import { ProviderSetup } from './components/ProviderSetup'
import type { AdState, AppView, Track } from './types'
import { formatTime } from './lib/lyrics'
import { findAudioSource, isPreviewAudioUrl } from './lib/audio'
import { hasBackend } from './lib/api'
import { useAudioEngine } from './lib/useAudioEngine'
import { useLiveIdentify, type LiveMatch } from './lib/useLiveIdentify'
import { beginSpotifyLogin, completeSpotifyLogin, findSpotifyTrack, hasSpotifyAuth, hasSpotifyPlayback } from './lib/spotify'
import { canUseSpotifyPlayback, isSpotifyUriBlocked, resetSpotifyPlayer } from './lib/spotifyPlayer'
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
  identify: { title: 'Identify', subtitle: 'Live microphone recognition and lyric health' },
  library: { title: 'Library', subtitle: 'Your playlists and Spotify' },
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

function AdBar({ ad }: { ad: AdState }) {
  const progress = ad.total > 0 ? Math.max(0, Math.min(1, 1 - ad.remaining / ad.total)) : 0
  return (
    <div className="ad-bar" role="status" aria-live="polite">
      <span className="ad-tag">AD</span>
      <div className={`ad-track${ad.total > 0 ? '' : ' indeterminate'}`}>
        <i style={{ width: `${progress * 100}%` }} />
      </div>
      <span className="ad-time">{ad.total > 0 ? `${Math.ceil(Math.max(0, ad.remaining))}s left` : 'waiting for song'}</span>
    </div>
  )
}

export default function App() {
  const [view, setView] = useState<AppView>('search')
  const [catalog, setCatalog] = useState<Track[]>(loadSavedTracks)
  const [recentIds, setRecentIds] = useState<string[]>(loadRecentTrackIds)
  const [selectedId, setSelectedId] = useState<string>(() => {
    const saved = loadSavedTracks()
    return loadRecentTrackIds().find((id) => saved.some((track) => track.id === id)) || saved[0]?.id || ''
  })
  const [providerVersion, setProviderVersion] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [audioDuration, setAudioDuration] = useState(0)
  const [audioError, setAudioError] = useState<string | null>(null)
  const [delayMs, setDelayMs] = useState(loadDelayMs)
  const [playlists, setPlaylists] = useState<Playlist[]>(loadPlaylists)
  const [spotifyReady, setSpotifyReady] = useState(hasSpotifyAuth)
  const [spotifyError, setSpotifyError] = useState<string | null>(null)
  const [ad, setAd] = useState<AdState | null>(null)
  const [playbackNotice, setPlaybackNotice] = useState<string | null>(null)
  const [pendingSpotify, setPendingSpotify] = useState<string | null>(null)
  const [connectingSpotify, setConnectingSpotify] = useState(false)
  const live = useLiveIdentify()

  const selected = useMemo<Track | null>(() => catalog.find((t) => t.id === selectedId) ?? null, [catalog, selectedId])
  const pendingRef = useRef<{ startAt: number; play: boolean } | null>(null)
  const catalogRef = useRef(catalog)
  const spotifyTriedRef = useRef<Set<string>>(new Set())
  const resolvingRef = useRef<Set<string>>(new Set())
  const recordedRef = useRef<string | null>(null)

  useEffect(() => { catalogRef.current = catalog }, [catalog])

  const { seek } = useAudioEngine({
    track: selected,
    playing,
    spotifyReady,
    holdPlayback: !!pendingSpotify && pendingSpotify === selectedId && !selected?.spotifyUri,
    onTime: setTime,
    onPlayingChange: setPlaying,
    onDuration: setAudioDuration,
    onEnded: () => setPlaying(false),
    onError: setAudioError,
    onAd: setAd,
    onFallback: (message, track) => {
      setPlaybackNotice(message)
      if (!track?.spotifyUri) return
      const uri = track.spotifyUri
      spotifyTriedRef.current.add(track.id)
      setCatalog((c) => c.map((t) => (t.spotifyUri === uri ? { ...t, spotifyUri: undefined } : t)))
    },
  })

  useEffect(() => {
    recordedRef.current = null
    const pend = pendingRef.current
    pendingRef.current = null
    setTime(pend?.startAt ?? 0)
    setPlaying(pend?.play ?? false)
    setAudioDuration(0)
    setAudioError(null)
    setAd(null)
    setPlaybackNotice(null)
  }, [selectedId])

  useEffect(() => { savePlaylists(playlists) }, [playlists])
  useEffect(() => { saveSavedTracks(catalog) }, [catalog])
  useEffect(() => { saveRecentTrackIds(recentIds) }, [recentIds])
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
        spotifyTriedRef.current.clear()
        setSpotifyReady(true)
        setSpotifyError(null)
        setView('library')
      })
      .catch((e: any) => {
        setSpotifyError(e?.message || 'Spotify login failed.')
        setSpotifyReady(hasSpotifyAuth())
        setView('library')
      })
  }, [])

  const selectedYoutubeId = selected?.youtubeId
  const selectedAudioUrl = selected?.audioUrl
  const selectedSpotifyUri = selected?.spotifyUri

  useEffect(() => {
    const track = catalogRef.current.find((t) => t.id === selectedId)
    if (!track) return

    if (track.spotifyUri) {
      if (canUseSpotifyPlayback() && !isSpotifyUriBlocked(track.spotifyUri)) return
      // Spotify cannot use this URI any more — drop it so YouTube can take over.
      setCatalog((c) => c.map((t) => (t.id === track.id ? { ...t, spotifyUri: undefined } : t)))
      return
    }

    const wantSpotify = canUseSpotifyPlayback() && !spotifyTriedRef.current.has(track.id)
    if (!wantSpotify && (track.youtubeId || track.audioUrl)) return

    const resolving = resolvingRef.current
    if (resolving.has(track.id)) return
    resolving.add(track.id)
    let cancelled = false

    ;(async () => {
      try {
        if (wantSpotify) {
          spotifyTriedRef.current.add(track.id)
          const uri = await findSpotifyTrack(track.title, track.artist).catch(() => null)
          if (cancelled) return
          if (uri && canUseSpotifyPlayback() && !isSpotifyUriBlocked(uri)) {
            setCatalog((c) => c.map((t) => (t.id === track.id ? { ...t, spotifyUri: uri } : t)))
            return
          }
        }

        const current = catalogRef.current.find((t) => t.id === track.id) ?? track
        if (current.youtubeId || current.audioUrl) return
        const src = await findAudioSource(current.title, current.artist)
        if (cancelled) return
        if (!src.youtubeId && !src.audioUrl) {
          setAudioError('No audio source found for this track.')
          setPlaying(false)
          return
        }
        setCatalog((c) => c.map((t) => t.id === track.id ? {
          ...t,
          youtubeId: t.youtubeId ?? src.youtubeId,
          audioUrl: t.audioUrl ?? src.audioUrl,
          cover: t.cover || src.cover || '',
        } : t))
      } catch {
        if (!cancelled) { setAudioError('Could not find audio for this track.'); setPlaying(false) }
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
  }, [selectedId, selectedSpotifyUri, selectedYoutubeId, selectedAudioUrl, providerVersion, spotifyReady])

  const prepareTrack = (t: Track) => {
    if (!t.spotifyUri && canUseSpotifyPlayback() && !spotifyTriedRef.current.has(t.id)) {
      setPendingSpotify(t.id)
    } else {
      setPendingSpotify(null)
    }
  }

  const openTrack = (t: Track, startAt = 0) => {
    prepareTrack(t)
    setCatalog((c) => c.some((x) => x.id === t.id) ? c.map((x) => x.id === t.id ? t : x) : [t, ...c])
    if (t.id === selectedId) {
      pendingRef.current = null
      seek(startAt)
      setPlaying(true)
      setFullscreen(true)
      return
    }
    pendingRef.current = { startAt, play: true }
    setTime(0)
    setSelectedId(t.id)
    setFullscreen(true)
  }

  const currentIndex = catalog.findIndex((t) => t.id === selectedId)
  const next = () => {
    if (!catalog.length) return
    const target = catalog[(currentIndex + 1 + catalog.length) % catalog.length]
    prepareTrack(target)
    pendingRef.current = { startAt: 0, play: playing }
    setTime(0)
    setSelectedId(target.id)
  }
  const prev = () => {
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

  const connectSpotify = async () => {
    setSpotifyError(null)
    setConnectingSpotify(true)
    try {
      await beginSpotifyLogin()
    } catch (e: any) {
      setSpotifyError(e?.message || 'Could not connect to Spotify.')
      setConnectingSpotify(false)
      setView('library')
    }
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

  const liveHealth = useMemo(() => {
    if (!selected) return null
    const recent = live.matches.slice(0, 6)
    if (!recent.length) return null
    return Math.round((100 * recent.filter((m) => sameSong(m, selected)).length) / recent.length)
  }, [live.matches, selected])

  const meta = VIEW_META[view]

  return (
    <div className="app">
      <div className="shell">
        <aside className="panel sidebar">
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
          </nav>

          <div className="sidebar-foot">
            <p className="production">LyricFlow production 2026</p>
          </div>
        </aside>

        <main className="panel main">
          <div className="main-header">
            <div>
              <h1>{meta.title}</h1>
              {meta.subtitle && <div className="muted small">{meta.subtitle}</div>}
            </div>
            {!spotifyReady ? (
              <button className="btn spotify-btn" onClick={() => void connectSpotify()} disabled={connectingSpotify}>
                <span className="spotify-dot" aria-hidden="true" />
                {connectingSpotify ? 'Opening Spotify…' : 'Connect Spotify'}
              </button>
            ) : !hasSpotifyPlayback() ? (
              <button className="btn spotify-btn" onClick={() => void connectSpotify()} disabled={connectingSpotify}>
                {connectingSpotify ? 'Opening Spotify…' : 'Reconnect Spotify for playback'}
              </button>
            ) : (
              <span className="spotify-chip"><span className="spotify-dot" aria-hidden="true" />Spotify connected</span>
            )}
          </div>
          <div className="main-body">
            <div className="view-enter" key={view}>
            {view === 'identify' ? (
              <IdentifyView live={live} currentTrack={selected} health={liveHealth} onOpen={openTrack} />
            ) : view === 'search' ? (
              <SearchView onOpen={openTrack} recentTracks={recentIds.map((id) => catalog.find((track) => track.id === id)).filter((track): track is Track => !!track)} />
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
                onSpotifyReadyChange={setSpotifyReady}
                spotifyError={spotifyError}
                onDismissSpotifyError={() => setSpotifyError(null)}
              />
            )}
            </div>
          </div>
        </main>

        <aside className="panel rightbar">
          {audioError && <div className="notice error" style={{ margin: '4px 10px 0' }}>{audioError}</div>}
          {playbackNotice && <div className="notice" style={{ margin: '4px 10px 0' }}>{playbackNotice}</div>}
          {!hasBackend && selected && !selected.youtubeId && !selected.spotifyUri && (
            <div className="notice" style={{ margin: '4px 10px 0' }}>
              Playing a 30-second preview. Connect Spotify (Premium) to play full songs.
            </div>
          )}
          {!hasBackend && <ProviderSetup onSaved={onProvidersSaved} />}
          <LyricsView track={selected} currentTime={time} duration={playbackDuration} delayMs={delayMs} onOpenFullscreen={() => setFullscreen(true)} playlists={playlists} onAdd={addToPlaylist} onCreate={onCreatePlaylist} />
          {selected?.youtubeId && (
            <div className="youtube-box">
              <div className="section-title">Audio source</div>
              <a className="yt-source" href={`https://www.youtube.com/watch?v=${selected.youtubeId}`} target="_blank" rel="noreferrer">
                <img src={`https://i.ytimg.com/vi/${selected.youtubeId}/mqdefault.jpg`} alt="" />
                <span>Full track · YouTube</span>
              </a>
            </div>
          )}
        </aside>
      </div>

      <footer className="panel player">
        <div className="now-playing">
          <div className="mini-cover" style={{ background: selected?.cover?.startsWith('http') ? `url(${selected.cover}) center/cover` : (selected?.cover || 'var(--panel-2)') }} />
          <div className="np-meta">
            <div className="t">{selected?.title ?? 'Nothing playing'}</div>
            <div className="a">{selected ? `${selected.artist} • ${selected.album}` : 'Search a song to start'}</div>
          </div>
        </div>
        <div className="transport">
          <div className="controls">
            <button className="icon-btn" onClick={prev} title="Previous">⏮</button>
            <button className="icon-btn play" onClick={() => selected && setPlaying((p) => !p)} disabled={!selected || !!ad} title={ad ? 'Waiting for the ad to finish' : 'Play/Pause'}>{playing ? '❚❚' : '▶'}</button>
            <button className="icon-btn" onClick={next} title="Next">⏭</button>
          </div>
          {ad && <AdBar ad={ad} />}
          <div className="progress">
            <span>{formatTime(time)}</span>
            <input className="range" type="range" min={0} max={playbackDuration || 300} step={0.05} value={Math.min(time, playbackDuration || 300)} onChange={(e) => seek(Number(e.target.value))} disabled={!!ad} />
            <span>{formatTime(playbackDuration)}</span>
          </div>
        </div>
        <div className="extras">
          <div className="delay-control" title="Adjust when each word appears in 100 ms steps">
            <span className="muted small">Words</span>
            <button className="icon-btn tiny" onClick={() => updateDelay(delayMs - 100)} aria-label="Show words 100 milliseconds earlier">−</button>
            <button className="delay-value" onClick={() => updateDelay(0)} title="Reset word timing" aria-live="polite">
              {delayMs > 0 ? '+' : ''}{delayMs} ms
            </button>
            <button className="icon-btn tiny" onClick={() => updateDelay(delayMs + 100)} aria-label="Show words 100 milliseconds later">+</button>
          </div>
          <button className="btn" onClick={() => setFullscreen(true)}>Fullscreen</button>
        </div>
      </footer>

      {fullscreen && selected && (
        <FullscreenLyrics
          track={selected}
          currentTime={time}
          duration={playbackDuration}
          playing={playing}
          delayMs={delayMs}
          ad={ad}
          onDelayChange={updateDelay}
          onClose={() => setFullscreen(false)}
          onTogglePlay={() => setPlaying((p) => !p)}
          onSeek={seek}
        />
      )}
    </div>
  )
}
