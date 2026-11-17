import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { LyricsView } from './components/LyricsView'
import { IdentifyView } from './components/IdentifyView'
import { SearchView } from './components/SearchView'
import { LibraryView } from './components/LibraryView'
import { AddToPlaylist } from './components/AddToPlaylist'
import { FullscreenLyrics } from './components/FullscreenLyrics'
import { ProviderSetup } from './components/ProviderSetup'
import { tracks as demoTracks } from './data/tracks'
import type { AppView, Track } from './types'
import { formatTime } from './lib/lyrics'
import { findAudioSource, isPreviewAudioUrl } from './lib/audio'
import { hasBackend } from './lib/api'
import { getYouTubeApiKey } from './lib/keys'
import { useAudioEngine } from './lib/useAudioEngine'
import { useLiveIdentify, type LiveMatch } from './lib/useLiveIdentify'
import { completeSpotifyLogin, hasSpotifyAuth } from './lib/spotify'
import {
  createPlaylist,
  loadPlaylists,
  loadSavedTracks,
  savePlaylists,
  saveSavedTracks,
  type Playlist,
} from './lib/playlists'

const DELAY_KEY = 'lf-lyric-delay'
const DELAY_LIMIT = 3000

function loadDelayMs(): number {
  const raw = Number(localStorage.getItem(DELAY_KEY))
  return Number.isFinite(raw) ? Math.max(-DELAY_LIMIT, Math.min(DELAY_LIMIT, raw)) : 0
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

export default function App() {
  const [view, setView] = useState<AppView>('search')
  const [catalog, setCatalog] = useState<Track[]>(() => {
    const saved = loadSavedTracks()
    return [...demoTracks, ...saved.filter((t) => !demoTracks.some((d) => d.id === t.id))]
  })
  const [selectedId, setSelectedId] = useState<string>(demoTracks[0]?.id ?? '')
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
  const live = useLiveIdentify()

  const selected = useMemo<Track | null>(() => catalog.find((t) => t.id === selectedId) ?? null, [catalog, selectedId])
  const { seek } = useAudioEngine({
    track: selected,
    playing,
    onTime: setTime,
    onPlayingChange: setPlaying,
    onDuration: setAudioDuration,
    onEnded: () => setPlaying(false),
    onError: setAudioError,
  })
  const pendingRef = useRef<{ startAt: number; play: boolean } | null>(null)

  useEffect(() => {
    const pend = pendingRef.current
    pendingRef.current = null
    setTime(pend?.startAt ?? 0)
    setPlaying(pend?.play ?? false)
    setAudioDuration(0)
    setAudioError(null)
  }, [selectedId])

  useEffect(() => { savePlaylists(playlists) }, [playlists])
  useEffect(() => { saveSavedTracks(catalog) }, [catalog])

  const spotifyHandled = useRef(false)
  useEffect(() => {
    if (spotifyHandled.current) return
    spotifyHandled.current = true
    completeSpotifyLogin()
      .then((done) => {
        if (!done) return
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

  const resolvingRef = useRef<Set<string>>(new Set())
  const selectedYoutubeId = selected?.youtubeId
  const selectedAudioUrl = selected?.audioUrl
  const selectedSource = selected?.source
  const selectedTitle = selected?.title
  const selectedArtist = selected?.artist

  useEffect(() => {
    if (!selectedId || !selectedSource) return
    if (selectedYoutubeId || selectedAudioUrl) return
    if (selectedSource === 'demo') return
    const resolving = resolvingRef.current
    if (resolving.has(selectedId)) return
    resolving.add(selectedId)
    let cancelled = false
    findAudioSource(selectedTitle || '', selectedArtist || '')
      .then((src) => {
        if (cancelled) return
        if (!src.youtubeId && !src.audioUrl) {
          setAudioError('No audio source found for this track.')
          setPlaying(false)
          return
        }
        setCatalog((c) => c.map((t) => t.id === selectedId ? {
          ...t,
          youtubeId: t.youtubeId ?? src.youtubeId,
          audioUrl: t.audioUrl ?? src.audioUrl,
          cover: t.cover || src.cover || '',
        } : t))
      })
      .catch(() => { if (!cancelled) { setAudioError('Could not find audio for this track.'); setPlaying(false) } })
      .finally(() => { resolving.delete(selectedId) })
    return () => { cancelled = true; resolving.delete(selectedId) }
  }, [selectedId, selectedYoutubeId, selectedAudioUrl, selectedSource, selectedTitle, selectedArtist, providerVersion])

  const openTrack = (t: Track, startAt = 0) => {
    setCatalog((c) => c.some((x) => x.id === t.id) ? c.map((x) => x.id === t.id ? t : x) : [t, ...c])
    pendingRef.current = { startAt, play: true }
    setSelectedId(t.id)
    setFullscreen(true)
  }

  const currentIndex = catalog.findIndex((t) => t.id === selectedId)
  const next = () => {
    if (!catalog.length) return
    pendingRef.current = { startAt: 0, play: playing }
    setSelectedId(catalog[(currentIndex + 1 + catalog.length) % catalog.length].id)
  }
  const prev = () => {
    if (!catalog.length) return
    pendingRef.current = { startAt: 0, play: playing }
    setSelectedId(catalog[(currentIndex - 1 + catalog.length) % catalog.length].id)
  }

  const onProvidersSaved = () => {
    // Previews are 30 seconds long, so drop them and resolve again with the new provider.
    setCatalog((c) => c.map((t) => (isPreviewAudioUrl(t.audioUrl) ? { ...t, audioUrl: undefined } : t)))
    setProviderVersion((v) => v + 1)
  }

  const updateDelay = (ms: number) => {
    const next = Math.max(-DELAY_LIMIT, Math.min(DELAY_LIMIT, Math.round(ms)))
    setDelayMs(next)
    localStorage.setItem(DELAY_KEY, String(next))
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
    if (!selected || selected.source === 'demo') return null
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
          </div>
          <div className="main-body">
            {view === 'identify' ? (
              <IdentifyView live={live} currentTrack={selected} health={liveHealth} onOpen={openTrack} />
            ) : view === 'search' ? (
              <SearchView onOpen={openTrack} />
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
        </main>

        <aside className="panel rightbar">
          {audioError && <div className="notice error" style={{ margin: '4px 10px 0' }}>{audioError}</div>}
          {selected?.source === 'demo' && (
            <div className="notice" style={{ margin: '4px 10px 0' }}>Demo track · simulated playback. Search a real song for full audio.</div>
          )}
          {!hasBackend && selected && selected.source !== 'demo' && !selected.youtubeId && (
            <div className="notice" style={{ margin: '4px 10px 0' }}>
              {getYouTubeApiKey()
                ? 'No full-length source found for this track — playing the 30-second preview.'
                : 'Playing a 30-second preview. Add a free YouTube API key below to play full songs.'}
            </div>
          )}
          {!hasBackend && <ProviderSetup onSaved={onProvidersSaved} />}
          <LyricsView track={selected} currentTime={time} duration={playbackDuration} delayMs={delayMs} onOpenFullscreen={() => setFullscreen(true)} />
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
            <div className="a">{selected ? `${selected.artist} • ${selected.album}${selected.source === 'demo' ? ' · demo (no audio)' : ''}` : 'Search a song to start'}</div>
          </div>
        </div>
        <div className="transport">
          <div className="controls">
            <button className="icon-btn" onClick={prev} title="Previous">⏮</button>
            <button className="icon-btn play" onClick={() => selected && setPlaying((p) => !p)} disabled={!selected} title="Play/Pause">{playing ? '❚❚' : '▶'}</button>
            <button className="icon-btn" onClick={next} title="Next">⏭</button>
          </div>
          <div className="progress">
            <span>{formatTime(time)}</span>
            <input className="range" type="range" min={0} max={playbackDuration || 300} step={0.05} value={Math.min(time, playbackDuration || 300)} onChange={(e) => seek(Number(e.target.value))} />
            <span>{formatTime(playbackDuration)}</span>
          </div>
        </div>
        <div className="extras">
          <div className="delay-control" title="Lyric delay in milliseconds — positive values show lyrics later">
            <span className="muted small">Delay</span>
            <button className="icon-btn tiny" onClick={() => updateDelay(delayMs - 100)} aria-label="Lyrics earlier">−</button>
            <button className="delay-value" onClick={() => updateDelay(0)} title="Reset delay">
              {delayMs > 0 ? '+' : ''}{delayMs} ms
            </button>
            <button className="icon-btn tiny" onClick={() => updateDelay(delayMs + 100)} aria-label="Lyrics later">+</button>
          </div>
          <AddToPlaylist playlists={playlists} track={selected} onAdd={addToPlaylist} onCreate={onCreatePlaylist} />
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
          onDelayChange={updateDelay}
          onClose={() => setFullscreen(false)}
          onTogglePlay={() => setPlaying((p) => !p)}
          onSeek={seek}
        />
      )}
    </div>
  )
}
