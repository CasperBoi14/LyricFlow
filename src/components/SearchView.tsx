import { useState, type FormEvent } from 'react'
import type { SearchResult, Track } from '../types'
import { searchMusic } from '../lib/providers'
import { resolveToTrack } from '../lib/lrclib'

export function SearchView({ onOpen }: { onOpen: (t: Track) => void }) {
  const [q, setQ] = useState('')
  const [searching, setSearching] = useState(false)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<SearchResult[]>([])

  const doSearch = async (e: FormEvent) => {
    e.preventDefault()
    if (!q.trim() || searching) return
    setError(null)
    setSearching(true)
    try { setResults(await searchMusic(q)) }
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
      <form className="searchbar" onSubmit={doSearch} role="search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4.5 4.5" />
        </svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search songs or artists"
          aria-label="Search songs or artists"
          autoComplete="off"
        />
        <button className="search-go" type="submit" disabled={searching || !q.trim()} aria-busy={searching}>
          {searching && <span className="spinner" aria-hidden="true" />}
          <span>{searching ? 'Searching' : 'Search'}</span>
        </button>
      </form>

      {error && <div className="notice error">{error}</div>}

      {results.length > 0 && (
        <div className="track-grid">
          {results.map((r) => (
            <div key={r.id} className="track-card">
              <div className="cover" style={{ background: r.cover ? `url(${r.cover}) center/cover` : 'var(--panel-2)' }} />
              <div className="meta"><div className="title">{r.title}</div><div className="artist">{r.artist} · {r.album}</div></div>
              <div className="row" style={{ marginTop: 'auto' }}>
                <button className="btn primary" onClick={() => openResult(r)} disabled={openingId !== null}>
                  {openingId === r.id ? 'Opening…' : 'Get Live Lyrics'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
