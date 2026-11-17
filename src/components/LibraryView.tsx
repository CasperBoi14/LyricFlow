import { useEffect, useMemo, useRef, useState } from 'react'
import type { Track } from '../types'
import type { Playlist } from '../lib/playlists'
import { resolveToTrack } from '../lib/lrclib'
import {
  beginSpotifyLogin,
  disconnectSpotify,
  getSpotifyClientId,
  getSpotifyMe,
  getSpotifyServerConfig,
  getSpotifyPlaylistTracks,
  getSpotifyPlaylists,
  hasSpotifyAuth,
  hasSpotifyPlayback,
  setSpotifyClientId,
  spotifyRedirectTarget,
  type SpotifyPlaylist,
  type SpotifyProfile,
  type SpotifyTrack,
} from '../lib/spotify'
import { resetSpotifyPlayer } from '../lib/spotifyPlayer'

type Props = {
  playlists: Playlist[]
  catalog: Track[]
  currentTrack: Track | null
  onOpen: (t: Track) => void
  onCreate: (name: string) => Playlist
  onDelete: (id: string) => void
  onAddTrack: (playlistId: string, trackId: string) => void
  onRemoveTrack: (playlistId: string, trackId: string) => void
  spotifyReady: boolean
  onSpotifyReadyChange: (ready: boolean) => void
  spotifyError: string | null
  onDismissSpotifyError: () => void
}

export function LibraryView(props: Props) {
  const [tab, setTab] = useState<'mine' | 'spotify'>(props.spotifyReady ? 'spotify' : 'mine')
  const [name, setName] = useState('')
  const [activeId, setActiveId] = useState<string | null>(props.playlists[0]?.id ?? null)

  const active = useMemo(() => props.playlists.find((p) => p.id === activeId) ?? props.playlists[0] ?? null, [props.playlists, activeId])
  const activeTracks = useMemo(() => {
    if (!active) return [] as Track[]
    return active.trackIds.map((id) => props.catalog.find((t) => t.id === id)).filter((t): t is Track => !!t)
  }, [active, props.catalog])

  const create = () => {
    if (!name.trim()) return
    const playlist = props.onCreate(name)
    setName('')
    setActiveId(playlist.id)
  }

  return (
    <div className="library">
      <div className="lib-tabs">
        <button className={tab === 'mine' ? 'active' : ''} onClick={() => setTab('mine')}>My playlists</button>
        <button className={tab === 'spotify' ? 'active' : ''} onClick={() => setTab('spotify')}>Spotify</button>
      </div>

      {tab === 'mine' ? (
        <div className="lib-body">
          <div className="create-row">
            <input
              className="search"
              placeholder="New playlist name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
            />
            <button className="btn primary" onClick={create} disabled={!name.trim()}>Create</button>
          </div>

          {props.playlists.length === 0 ? (
            <div className="empty">Create a playlist, then add songs from the player bar.</div>
          ) : (
            <div className="lib-split">
              <div className="playlist-list">
                {props.playlists.map((p) => (
                  <button key={p.id} className={`playlist-chip ${p.id === active?.id ? 'active' : ''}`} onClick={() => setActiveId(p.id)}>
                    <span className="playlist-name">{p.name}</span>
                    <span className="playlist-count">{p.trackIds.length}</span>
                  </button>
                ))}
              </div>

              {active && (
                <div className="playlist-pane">
                  <div className="playlist-head">
                    <div>
                      <h3>{active.name}</h3>
                      <p className="muted small">{activeTracks.length} {activeTracks.length === 1 ? 'song' : 'songs'}</p>
                    </div>
                    <div className="row">
                      {props.currentTrack && !active.trackIds.includes(props.currentTrack.id) && (
                        <button className="btn small" onClick={() => props.onAddTrack(active.id, props.currentTrack!.id)}>Add current</button>
                      )}
                      <button className="btn small danger" onClick={() => props.onDelete(active.id)}>Delete</button>
                    </div>
                  </div>

                  {activeTracks.length === 0 ? (
                    <div className="empty">Empty playlist. Play a song and use “Add to playlist”.</div>
                  ) : (
                    <div className="track-list">
                      {activeTracks.map((t) => (
                        <div className="track-row" key={t.id}>
                          <div className="row-cover" style={{ background: t.cover?.startsWith('http') ? `url(${t.cover}) center/cover` : t.cover }} />
                          <div className="row-meta">
                            <div className="row-title">{t.title}</div>
                            <div className="muted small">{t.artist}</div>
                          </div>
                          <button className="btn small" onClick={() => props.onOpen(t)}>Play</button>
                          <button className="btn small ghost" onClick={() => props.onRemoveTrack(active.id, t.id)} aria-label="Remove">✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <SpotifyPane
          ready={props.spotifyReady}
          onReadyChange={props.onSpotifyReadyChange}
          error={props.spotifyError}
          onDismissError={props.onDismissSpotifyError}
          onOpen={props.onOpen}
        />
      )}
    </div>
  )
}

type SpotifyPaneProps = {
  ready: boolean
  onReadyChange: (ready: boolean) => void
  error: string | null
  onDismissError: () => void
  onOpen: (t: Track) => void
}

function SpotifyPane({ ready, onReadyChange, error, onDismissError, onOpen }: SpotifyPaneProps) {
  const [clientId, setClientId] = useState(() => getSpotifyClientId())
  const [serverConfigured, setServerConfigured] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [profile, setProfile] = useState<SpotifyProfile | null>(null)
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [tracks, setTracks] = useState<SpotifyTrack[]>([])
  const [loadingTracks, setLoadingTracks] = useState(false)
  const [openingTrack, setOpeningTrack] = useState<string | null>(null)
  const requestRef = useRef(0)

  useEffect(() => {
    if (!ready) return
    let cancelled = false
    Promise.all([getSpotifyMe(), getSpotifyPlaylists()])
      .then(([me, list]) => {
        if (cancelled) return
        setProfile(me)
        setPlaylists(list.items || [])
        setLocalError(null)
      })
      .catch((e: any) => {
        if (cancelled) return
        setLocalError(e?.message || 'Could not load Spotify.')
        if (!hasSpotifyAuth()) onReadyChange(false)
      })
    return () => { cancelled = true }
  }, [ready, onReadyChange])

  const loading = ready && !profile && !localError

  useEffect(() => {
    let cancelled = false
    getSpotifyServerConfig()
      .then((config) => { if (!cancelled) setServerConfigured(!!config?.configured) })
      .catch(() => { /* ignore */ })
    return () => { cancelled = true }
  }, [])

  const connect = async () => {
    setLocalError(null)
    setConnecting(true)
    try {
      if (!serverConfigured) setSpotifyClientId(clientId)
      await beginSpotifyLogin()
    } catch (e: any) {
      setLocalError(e?.message || 'Could not start Spotify login.')
      setConnecting(false)
    }
  }

  const openPlaylist = async (playlist: SpotifyPlaylist) => {
    const request = ++requestRef.current
    setOpenId(playlist.id)
    setLoadingTracks(true)
    setTracks([])
    try {
      const data = await getSpotifyPlaylistTracks(playlist.id)
      if (request !== requestRef.current) return
      setTracks((data.items || []).map((i) => i.track).filter((t): t is SpotifyTrack => !!t && !!t.name))
    } catch (e: any) {
      if (request !== requestRef.current) return
      setLocalError(e?.message || 'Could not load playlist tracks.')
    } finally {
      if (request === requestRef.current) setLoadingTracks(false)
    }
  }

  const openTrack = async (t: SpotifyTrack) => {
    setOpeningTrack(t.id || t.name)
    setLocalError(null)
    try {
      const track = await resolveToTrack({
        id: `spotify-${t.id || Date.now()}`,
        title: t.name,
        artist: t.artists.map((a) => a.name).join(', '),
        album: t.album?.name,
        duration: Math.round((t.duration_ms || 0) / 1000),
        cover: t.album?.images?.[0]?.url,
        source: 'spotify',
        spotifyUri: t.uri,
        externalUrl: t.external_urls?.spotify,
        tags: ['spotify'],
      })
      onOpen(track)
    } catch (e: any) {
      setLocalError(e?.message || 'Could not load lyrics.')
    } finally {
      setOpeningTrack(null)
    }
  }

  if (!ready) {
    return (
      <div className="spotify-setup">
        <h3>Connect Spotify</h3>
        <p className="muted">
          {serverConfigured
            ? 'Sign in with Spotify to load your playlists and play music through the in-app player. Playback needs Spotify Premium.'
            : 'Create an app in the Spotify developer dashboard, add the redirect URI below exactly as shown, then paste its Client ID. No secret is needed.'}
        </p>
        <div className="redirect-box">
          <span className="muted small">Redirect URI</span>
          <code>{spotifyRedirectTarget()}</code>
          <span className="muted small">Must match the dashboard character for character, including the trailing slash. Spotify requires HTTPS, or 127.0.0.1 for local development.</span>
        </div>
        {serverConfigured ? (
          <button className="btn primary spotify-connect" onClick={() => void connect()} disabled={connecting}>
            <span className="spotify-dot" aria-hidden="true" />
            {connecting ? 'Opening Spotify…' : 'Connect Spotify'}
          </button>
        ) : (
          <div className="create-row">
            <input
              className="search"
              placeholder="Spotify Client ID"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            />
            <button className="btn primary" onClick={() => void connect()} disabled={connecting || !clientId.trim()}>
              {connecting ? 'Connecting…' : 'Connect Spotify'}
            </button>
          </div>
        )}
        <a className="link" href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">Open Spotify dashboard</a>
        {(localError || error) && <div className="notice error">{localError || error}</div>}
      </div>
    )
  }

  return (
    <div className="spotify-pane">
      <div className="spotify-head">
        <div className="spotify-profile">
          {profile?.images?.[0]?.url ? <img src={profile.images[0].url} alt="" /> : <div className="avatar-blank" />}
          <div>
            <div className="row-title">{profile?.display_name || 'Spotify connected'}</div>
            <div className="muted small">
              {profile?.product === 'premium' ? 'Premium' : 'Spotify'} · {hasSpotifyPlayback() ? 'in-app playback' : 'playlists only'}
            </div>
          </div>
        </div>
        <div className="row">
          {!hasSpotifyPlayback() && (
            <button className="btn small" onClick={() => void beginSpotifyLogin().catch((e: any) => setLocalError(e?.message || 'Reconnect failed.'))}>
              Reconnect for playback
            </button>
          )}
          <button
            className="btn small ghost"
            onClick={() => { resetSpotifyPlayer(); disconnectSpotify(); setProfile(null); setPlaylists([]); setTracks([]); setOpenId(null); onReadyChange(false) }}
          >
            Disconnect
          </button>
        </div>
      </div>

      {(localError || error) && (
        <div className="notice error" onClick={onDismissError}>{localError || error}</div>
      )}

      {!hasSpotifyPlayback() && (
        <div className="notice">
          In-app playback needs Spotify Premium plus the streaming permission. Until you reconnect, songs play through YouTube instead.
        </div>
      )}

      {loading ? (
        <div className="empty">Loading your playlists…</div>
      ) : playlists.length === 0 ? (
        <div className="empty">No Spotify playlists found for this account.</div>
      ) : (
        <div className="lib-split">
          <div className="playlist-list">
            {playlists.map((p) => (
              <button key={p.id} className={`playlist-chip ${openId === p.id ? 'active' : ''}`} onClick={() => void openPlaylist(p)}>
                <span className="playlist-name">{p.name}</span>
                <span className="playlist-count">{p.tracks?.total ?? 0}</span>
              </button>
            ))}
          </div>

          <div className="playlist-pane">
            {!openId ? (
              <div className="empty">Choose a Spotify playlist.</div>
            ) : loadingTracks ? (
              <div className="empty">Loading tracks…</div>
            ) : (
              <>
                <div className="playlist-head">
                  <h3>{playlists.find((p) => p.id === openId)?.name || 'Playlist'}</h3>
                  <span className="muted small">{tracks.length} songs</span>
                </div>
                <div className="track-list">
                  {tracks.map((t, i) => (
                    <div className="track-row" key={`${t.id || 'x'}-${i}`}>
                      <div className="row-cover" style={{ background: t.album?.images?.[0]?.url ? `url(${t.album.images[0].url}) center/cover` : 'var(--panel-2)' }} />
                      <div className="row-meta">
                        <div className="row-title">{t.name}</div>
                        <div className="muted small">{t.artists.map((a) => a.name).join(', ')}</div>
                      </div>
                      <button className="btn small" onClick={() => void openTrack(t)} disabled={!!openingTrack}>
                        {openingTrack === (t.id || t.name) ? 'Loading…' : 'Play'}
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
