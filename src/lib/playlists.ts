import type { Track } from '../types'

export type Playlist = { id: string; name: string; trackIds: string[]; createdAt: number }

const PLAYLIST_KEY = 'lf-playlists'
const TRACK_KEY = 'lf-saved-tracks'
const RECENT_KEY = 'lf-recent-tracks'

const uid = () => `pl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export function loadPlaylists(): Playlist[] {
  try {
    const raw = localStorage.getItem(PLAYLIST_KEY)
    const list = raw ? JSON.parse(raw) : []
    if (!Array.isArray(list)) return []
    return list.filter((p: any) => p?.id && typeof p.name === 'string' && Array.isArray(p.trackIds))
  } catch { return [] }
}

export function savePlaylists(playlists: Playlist[]) {
  localStorage.setItem(PLAYLIST_KEY, JSON.stringify(playlists))
}

export function createPlaylist(name: string): Playlist {
  return { id: uid(), name: name.trim() || 'Untitled playlist', trackIds: [], createdAt: Date.now() }
}

export function loadSavedTracks(): Track[] {
  try {
    const raw = localStorage.getItem(TRACK_KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list.filter((t: any) => t?.id && t?.title) : []
  } catch { return [] }
}

export function saveSavedTracks(tracks: Track[]) {
  const persistable = tracks.filter((t) => t.source !== 'demo')
  try {
    localStorage.setItem(TRACK_KEY, JSON.stringify(persistable))
  } catch { /* storage full — keep the app usable */ }
}

export function loadRecentTrackIds(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
    return Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string').slice(0, 20) : []
  } catch { return [] }
}

export function saveRecentTrackIds(ids: string[]) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(ids.slice(0, 20))) }
  catch { /* storage full */ }
}
