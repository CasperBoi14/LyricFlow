import { useRef, useState, type FormEvent } from 'react'
import type { SearchResult, Track } from '../types'
import { searchMusic } from '../lib/providers'
import { getArtistDetails, searchArtists, type Artist, type ArtistDetails } from '../lib/artists'
import { resolveToTrack } from '../lib/lrclib'
import { formatTime } from '../lib/lyrics'

export function SearchView({ onOpen, recentTracks }: { onOpen: (t: Track) => void; recentTracks: Track[] }) {
  const [q, setQ] = useState('')
  const [mode, setMode] = useState<'songs' | 'artists'>('songs')
  const [searching, setSearching] = useState(false)
  const [loadingArtist, setLoadingArtist] = useState(false)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<SearchResult[]>([])
  const [artists, setArtists] = useState<Artist[]>([])
  const [selectedArtist, setSelectedArtist] = useState<Artist | null>(null)
  const [artistDetails, setArtistDetails] = useState<ArtistDetails | null>(null)
  const requestRef = useRef(0)

  const selectArtist = async (artist: Artist, request = ++requestRef.current) => {
    setSelectedArtist(artist)
    setArtistDetails(null)
    setLoadingArtist(true)
    try {
      const details = await getArtistDetails(artist)
      if (request === requestRef.current) setArtistDetails(details)
    } catch (err: any) {
      if (request === requestRef.current) setError(err?.message || 'Could not load the artist.')
    } finally {
      if (request === requestRef.current) setLoadingArtist(false)
    }
  }

  const openArtistByName = async (name: string) => {
    const request = ++requestRef.current
    setMode('artists')
    setQ(name)
    setError(null)
    setSearching(true)
    try {
      const found = await searchArtists(name)
      if (request !== requestRef.current) return
      setArtists(found)
      setSelectedArtist(null)
      setArtistDetails(null)
      if (found[0]) await selectArtist(found[0], request)
    } catch (err: any) {
      if (request === requestRef.current) setError(err?.message || 'Artist search failed')
    } finally {
      if (request === requestRef.current) setSearching(false)
    }
  }

  const doSearch = async (e: FormEvent) => {
    e.preventDefault()
    if (!q.trim() || searching) return
    setError(null)
    setSearching(true)
    const request = ++requestRef.current
    try {
      if (mode === 'artists') {
        const found = await searchArtists(q)
        if (request !== requestRef.current) return
        setArtists(found)
        setSelectedArtist(null)
        setArtistDetails(null)
        if (found[0]) await selectArtist(found[0], request)
      } else {
        const found = await searchMusic(q)
        if (request === requestRef.current) setResults(found)
      }
    }
    catch (err: any) { setError(err.message || 'Search failed') }
    finally { setSearching(false) }
  }

  const openResult = async (r: SearchResult) => {
    if (openingId) return
    setError(null)
    setOpeningId(r.id)
    try {
      const track = await resolveToTrack({ id: r.id, title: r.title, artist: r.artist, album: r.album, duration: r.duration, cover: r.cover, source: 'search', externalUrl: r.externalUrl, tags: ['web'] })
      onOpen(track)
    } catch (err: any) { setError(err.message || 'Failed to load lyrics') }
    finally { setOpeningId(null) }
  }

  return (
    <div className="search-view">
      <div className="search-intro">
        <span className="eyebrow">EXPLORE MUSIC</span>
        <h2>Find the words behind the music.</h2>
        <p>Search for a song or artist, then follow every line as it plays.</p>
      </div>
      <div className="search-modes" role="group" aria-label="Search type">
        <button className={mode === 'songs' ? 'active' : ''} onClick={() => { requestRef.current += 1; setMode('songs'); setError(null); setSearching(false) }}>Songs</button>
        <button className={mode === 'artists' ? 'active' : ''} onClick={() => { requestRef.current += 1; setMode('artists'); setError(null); setSearching(false) }}>Artists</button>
      </div>
      <form className="searchbar" onSubmit={doSearch} role="search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4.5 4.5" />
        </svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={mode === 'artists' ? 'Search an artist' : 'Search a song'}
          aria-label={mode === 'artists' ? 'Search an artist' : 'Search a song'}
          autoComplete="off"
        />
        <button className="search-go" type="submit" disabled={searching || !q.trim()} aria-busy={searching}>
          {searching && <span className="spinner" aria-hidden="true" />}
          <span>{searching ? 'Searching' : 'Search'}</span>
        </button>
      </form>

      {error && <div className="notice error">{error}</div>}

      {mode === 'artists' && artists.length > 0 && (
        <div className="artist-choices" aria-label="Matching artists">
          {artists.map((artist) => (
            <button key={artist.id} className={selectedArtist?.id === artist.id ? 'active' : ''}
              onClick={() => { setError(null); void selectArtist(artist) }}>{artist.name}</button>
          ))}
        </div>
      )}

      {mode === 'artists' && selectedArtist && (
        <section className="artist-profile" aria-label={`${selectedArtist.name} songs`}>
          <div className="artist-hero">
            <div className="artist-photo" style={{ backgroundImage: artistDetails?.image ? `url(${artistDetails.image})` : undefined }} aria-hidden="true" />
            <div className="artist-hero-text">
              <span className="section-title">Artist</span>
              <h2>{selectedArtist.name}</h2>
              {selectedArtist.genre && <p>{selectedArtist.genre}</p>}
              {selectedArtist.url && <a href={selectedArtist.url} target="_blank" rel="noreferrer">Open artist on Apple Music ↗</a>}
              {artistDetails?.imageSource === 'photo' && <a className="muted small" href={`https://en.wikipedia.org/wiki/${encodeURIComponent(selectedArtist.name.replaceAll(' ', '_'))}`} target="_blank" rel="noreferrer">Photo via Wikipedia</a>}
              {artistDetails?.imageSource === 'artwork' && <span className="muted small">Album artwork shown</span>}
            </div>
          </div>
          {loadingArtist ? <div className="empty">Loading songs…</div> : artistDetails?.songs.length ? (
            <div className="artist-songs">
              <h3>Songs by {selectedArtist.name}</h3>
              {artistDetails.songs.map((song) => (
                <div className="track-row" key={song.id}>
                  <div className="row-cover" style={{ background: song.cover ? `url(${song.cover}) center/cover` : 'var(--panel-2)' }} />
                  <div className="row-meta"><div className="row-title">{song.title}</div><div className="muted small">{song.album} · {formatTime(song.duration)}</div></div>
                  <button className="btn small" onClick={() => void openResult(song)} disabled={openingId !== null}>
                    {openingId === song.id ? 'Opening…' : 'Play + lyrics'}
                  </button>
                </div>
              ))}
            </div>
          ) : <div className="empty">No songs found for this artist.</div>}
        </section>
      )}

      {mode === 'artists' && !searching && artists.length === 0 && q.trim() && !error && (
        <div className="muted small">Search for an artist to see their songs.</div>
      )}

      {mode === 'songs' && results.length > 0 && (
        <div className="track-grid">
          {results.map((r) => (
            <div key={r.id} className="track-card">
              <div className="cover" style={{ background: r.cover ? `url(${r.cover}) center/cover` : 'var(--panel-2)' }} />
              <div className="meta"><div className="title">{r.title}</div><div className="artist"><button className="artist-link" onClick={() => void openArtistByName(r.artist)}>{r.artist}</button> · {r.album}</div></div>
              <div className="row" style={{ marginTop: 'auto' }}>
                <button className="btn primary" onClick={() => openResult(r)} disabled={openingId !== null}>
                  {openingId === r.id ? 'Opening…' : 'Get Live Lyrics'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {recentTracks.length > 0 && (
        <section className="recent-section" aria-label="Recently played">
          <h2 className="section-title">Recently played</h2>
          <div className="track-list">
            {recentTracks.map((track) => (
              <div className="track-row" key={track.id}>
                <div className="row-cover" style={{ background: track.cover?.startsWith('http') ? `url(${track.cover}) center/cover` : 'var(--panel-2)' }} />
                <div className="row-meta">
                  <div className="row-title">{track.title}</div>
                  <div className="muted small">{track.artist}</div>
                </div>
                <button className="btn small" onClick={() => onOpen(track)}>Play</button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
