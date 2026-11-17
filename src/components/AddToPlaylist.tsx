import { useEffect, useRef, useState } from 'react'
import type { Track } from '../types'
import type { Playlist } from '../lib/playlists'

type Props = {
  playlists: Playlist[]
  track: Track | null
  onAdd: (playlistId: string, trackId: string) => void
  onCreate: (name: string) => Playlist
  placement?: 'up' | 'down'
}

export function AddToPlaylist({ playlists, track, onAdd, onCreate, placement = 'up' }: Props) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [added, setAdded] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    const focus = playlists.length === 0 ? window.setTimeout(() => inputRef.current?.focus(), 50) : undefined
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      if (focus) window.clearTimeout(focus)
    }
  }, [open, playlists.length])

  useEffect(() => () => { if (timerRef.current) window.clearTimeout(timerRef.current) }, [])

  const flash = (label: string) => {
    setAdded(label)
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setAdded(null), 1800)
  }

  const add = (playlist: Playlist) => {
    if (!track) return
    if (!playlist.trackIds.includes(track.id)) onAdd(playlist.id, track.id)
    flash(playlist.name)
    setOpen(false)
  }

  const create = () => {
    const trimmed = name.trim()
    if (!trimmed || !track) return
    const playlist = onCreate(trimmed)
    onAdd(playlist.id, track.id)
    setName('')
    flash(trimmed)
    setOpen(false)
  }

  return (
    <div className="add-wrap" ref={wrapRef}>
      <button
        className={`btn add-btn ${open ? 'active' : ''}`}
        onClick={() => setOpen((o) => !o)}
        disabled={!track}
        aria-haspopup="menu"
        aria-expanded={open}
        title={added ? `Added to ${added}` : 'Add current song to a playlist'}
      >
        {added ? '✓ Added' : '+ Playlist'}
      </button>

      {open && (
        <div className={`add-menu ${placement}`} role="menu" aria-label="Add to playlist">
          <div className="add-menu-head">
            Add <span>{track?.title}</span>
          </div>

          <div className="add-list">
            {playlists.length === 0 ? (
              <div className="add-empty">No playlists yet. Name one below.</div>
            ) : (
              playlists.map((playlist) => {
                const exists = !!track && playlist.trackIds.includes(track.id)
                return (
                  <button
                    key={playlist.id}
                    className="add-row"
                    role="menuitem"
                    onClick={() => add(playlist)}
                    disabled={exists}
                  >
                    <span className="add-name">{playlist.name}</span>
                    <span className="add-count">{exists ? '✓' : playlist.trackIds.length}</span>
                  </button>
                )
              })
            )}
          </div>

          <div className="add-new">
            <input
              ref={inputRef}
              className="add-input"
              placeholder="New playlist"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') create() }}
              aria-label="New playlist name"
            />
            <button className="btn small primary" onClick={create} disabled={!name.trim()}>Create</button>
          </div>
        </div>
      )}
    </div>
  )
}
