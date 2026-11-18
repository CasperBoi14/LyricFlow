import { useEffect, useMemo, useRef, useState } from 'react'
import type { Track } from '../types'
import type { Playlist } from '../lib/playlists'
import { resolveToTrack } from '../lib/lrclib'
import {
  loadSpotifyPlaylistCache,
  getSpotifyPlaylistTracks,
  getSpotifyPlaylists,
  hasSpotifyAuth,
  SpotifyApiError,
  type SpotifyPlaylist,
  type SpotifyTrack,
} from '../lib/spotify'

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
  onOpenSettings: () => void
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
          onOpenSettings={props.onOpenSettings}
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
  onOpenSettings: () => void
}

function SpotifyPane({ ready, onReadyChange, error, onDismissError, onOpen, onOpenSettings }: SpotifyPaneProps) {
  const [localError, setLocalError] = useState<string | null>(null)
  const [errorScope, setErrorScope] = useState<'playlists' | 'tracks' | null>(null)
  const [cachedPage] = useState(loadSpotifyPlaylistCache)
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>(() => cachedPage?.items || [])
  const [loadingPlaylists, setLoadingPlaylists] = useState(ready && !cachedPage)
  const [reloadPlaylists, setReloadPlaylists] = useState(0)
  const [retryAt, setRetryAt] = useState<number | null>(null)
  const [clock, setClock] = useState(Date.now)
  const failuresRef = useRef(0)
  const [nextPlaylistOffset, setNextPlaylistOffset] = useState<number | null>(cachedPage?.next ? cachedPage.items.length : null)
  const [loadingMorePlaylists, setLoadingMorePlaylists] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [tracks, setTracks] = useState<SpotifyTrack[]>([])
  const [loadingTracks, setLoadingTracks] = useState(false)
  const [loadingMoreTracks, setLoadingMoreTracks] = useState(false)
  const [nextTrackOffset, setNextTrackOffset] = useState<number | null>(null)
  const [openingTrack, setOpeningTrack] = useState<string | null>(null)
  const requestRef = useRef(0)

  useEffect(() => {
    if (!ready) return
    let cancelled = false
    let retryTimer = 0
    getSpotifyPlaylists(0, reloadPlaylists > 0)
      .then((list) => {
        if (cancelled) return
        failuresRef.current = 0
        setRetryAt(null)
        setPlaylists(list.items || [])
        setNextPlaylistOffset(list.next ? (list.items || []).length : null)
        setLocalError(null)
        setErrorScope(null)
      })
      .catch((e: any) => {
        if (cancelled) return
        const limited = e instanceof SpotifyApiError && e.status === 429
        if (limited) {
          failuresRef.current += 1
          const delay = e.retryAt
            ? Math.max(1_000, e.retryAt - Date.now() + 1_000)
            : Math.min(5 * 60_000, 30_000 * 2 ** (failuresRef.current - 1))
          setRetryAt(Date.now() + delay)
          retryTimer = window.setTimeout(() => setReloadPlaylists((count) => count + 1), delay)
        } else setRetryAt(null)
        setLocalError(e instanceof SpotifyApiError && e.status === 403
          ? 'Spotify denied access (403). In your Spotify Developer app, add this account under Users Management, use Premium, then reconnect to grant playlist access.'
          : limited ? 'Spotify is temporarily limiting playlist requests. Saved playlists remain available; LyricFlow will retry automatically.'
            : e?.message || 'Could not load Spotify.')
        setErrorScope('playlists')
        if (!hasSpotifyAuth()) onReadyChange(false)
      })
      .finally(() => { if (!cancelled) setLoadingPlaylists(false) })
    return () => { cancelled = true; window.clearTimeout(retryTimer) }
  }, [ready, onReadyChange, reloadPlaylists])

  const loading = ready && loadingPlaylists && !localError && playlists.length === 0
  const retryPlaylists = () => { setLoadingPlaylists(true); setRetryAt(null); setReloadPlaylists((count) => count + 1) }

  useEffect(() => {
    if (!retryAt) return
    const timer = window.setInterval(() => setClock(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [retryAt])

  const openPlaylist = async (playlist: SpotifyPlaylist) => {
    const request = ++requestRef.current
    setOpenId(playlist.id)
    setLoadingTracks(true)
    setTracks([])
    setNextTrackOffset(null)
    setLocalError(null)
    setErrorScope(null)
    try {
      const data = await getSpotifyPlaylistTracks(playlist.id)
      if (request !== requestRef.current) return
      setTracks(data.tracks)
      setNextTrackOffset(data.nextOffset)
      if (data.cached) { setLocalError('Showing saved songs while Spotify is rate limiting requests.'); setErrorScope('tracks') }
    } catch (e: any) {
      if (request !== requestRef.current) return
      setLocalError(e instanceof SpotifyApiError && e.status === 403
        ? 'Spotify denied this playlist (403). Spotify currently allows in-app items from playlists you own or collaborate on. Open a followed playlist in Spotify instead.'
        : e?.message || 'Could not load playlist tracks.')
      setErrorScope('tracks')
    } finally {
      if (request === requestRef.current) setLoadingTracks(false)
    }
  }

  const loadMorePlaylists = async () => {
    if (nextPlaylistOffset === null || loadingMorePlaylists) return
    setLoadingMorePlaylists(true)
    try {
      const page = await getSpotifyPlaylists(nextPlaylistOffset)
      setPlaylists((current) => [...current, ...(page.items || [])])
      setNextPlaylistOffset(page.next ? nextPlaylistOffset + (page.items || []).length : null)
    } catch (e: any) {
      setLocalError(e?.message || 'Could not load more playlists.')
      setErrorScope('playlists')
    } finally { setLoadingMorePlaylists(false) }
  }

  const loadMoreTracks = async () => {
    if (!openId || nextTrackOffset === null || loadingMoreTracks) return
    const request = requestRef.current
    setLoadingMoreTracks(true)
    try {
      const data = await getSpotifyPlaylistTracks(openId, nextTrackOffset)
      if (request !== requestRef.current) return
      setTracks((current) => [...current, ...data.tracks])
      setNextTrackOffset(data.nextOffset)
    } catch (e: any) {
      if (request === requestRef.current) { setLocalError(e?.message || 'Could not load more tracks.'); setErrorScope('tracks') }
    } finally {
      if (request === requestRef.current) setLoadingMoreTracks(false)
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
      setErrorScope('tracks')
    } finally {
      setOpeningTrack(null)
    }
  }

  if (!ready) {
    return (
      <div className="spotify-setup">
        <h3>Spotify playlists</h3>
        <p className="muted">Connect your Spotify account in Settings to browse its playlists here.</p>
        <button className="btn primary" onClick={onOpenSettings}>Open Spotify settings</button>
      </div>
    )
  }

  return (
    <div className="spotify-pane">
      <div className="spotify-head">
        <div><div className="row-title">Spotify playlists</div><div className="muted small">Browse your saved playlists</div></div>
        <button className="btn small ghost" onClick={onOpenSettings}>Connection settings</button>
      </div>

      {(localError || error) && (
        <div className="notice error">
          {localError || error}
          {retryAt && <span className="muted small"> Retrying in {Math.max(0, Math.ceil((retryAt - clock) / 1000))}s.</span>}
          {localError && errorScope === 'playlists' && <button className="btn small" onClick={retryPlaylists} disabled={loadingPlaylists || (!!retryAt && retryAt > clock)}>Retry playlists</button>}
          {!localError && error && <button className="link" onClick={onDismissError}>Dismiss</button>}
        </div>
      )}

      {loading ? (
        <div className="empty">Loading your playlists…</div>
      ) : playlists.length === 0 ? (
        <div className="empty">
          {localError ? 'No playlists available yet. Try again above.' : 'No Spotify playlists found for this account.'}
        </div>
      ) : (
        <div className="lib-split">
          <div className="playlist-list">
            {playlists.map((p) => (
              <button key={p.id} className={`playlist-chip ${openId === p.id ? 'active' : ''}`} onClick={() => void openPlaylist(p)}>
                <span className="playlist-name">{p.name}</span>
                <span className="playlist-count">{p.items?.total ?? p.tracks?.total ?? 0}</span>
              </button>
            ))}
            {nextPlaylistOffset !== null && (
              <button className="btn small" onClick={() => void loadMorePlaylists()} disabled={loadingMorePlaylists}>
                {loadingMorePlaylists ? 'Loading…' : 'Load more playlists'}
              </button>
            )}
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
                  <div className="row">
                    <span className="muted small">{tracks.length} songs</span>
                    {playlists.find((p) => p.id === openId)?.external_urls?.spotify && (
                      <a className="link small" href={playlists.find((p) => p.id === openId)!.external_urls!.spotify} target="_blank" rel="noreferrer">Open in Spotify</a>
                    )}
                  </div>
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
                {nextTrackOffset !== null && (
                  <button className="btn small" onClick={() => void loadMoreTracks()} disabled={loadingMoreTracks}>
                    {loadingMoreTracks ? 'Loading…' : 'Load more songs'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
