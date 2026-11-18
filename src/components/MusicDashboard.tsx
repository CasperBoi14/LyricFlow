import { useEffect, useMemo, useState } from 'react'
import type { HistoryEntry } from '../lib/listeningHistory'

type Props = { history: HistoryEntry[]; onOpen: (entry: HistoryEntry) => void }
const periods = [{ label: 'Today', days: 1 }, { label: '7 days', days: 7 }, { label: '30 days', days: 30 }, { label: 'All time', days: 0 }]
const timeLabel = (seconds: number) => seconds >= 3600 ? `${(seconds / 3600).toFixed(1)} hr` : `${Math.round(seconds / 60)} min`

export function MusicDashboard({ history, onOpen }: Props) {
  const [days, setDays] = useState(7)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(timer) }, [])
  const filtered = useMemo(() => {
    const today = new Date(now); today.setHours(0, 0, 0, 0)
    const start = days === 1 ? today.getTime() : days ? now - days * 86_400_000 : 0
    return history.filter((entry) => entry.startedAt >= start)
  }, [history, days, now])
  const total = filtered.reduce((sum, entry) => sum + entry.seconds, 0)
  const artistTotals = new Map<string, number>()
  const songTotals = new Map<string, { seconds: number; entry: HistoryEntry }>()
  const genreTotals = new Map<string, number>()
  for (const entry of filtered) {
    artistTotals.set(entry.artist, (artistTotals.get(entry.artist) || 0) + entry.seconds)
    const song = songTotals.get(entry.trackId)
    songTotals.set(entry.trackId, { seconds: (song?.seconds || 0) + entry.seconds, entry })
    if (entry.genre) genreTotals.set(entry.genre, (genreTotals.get(entry.genre) || 0) + entry.seconds)
  }
  const artists = [...artistTotals].sort((a, b) => b[1] - a[1]).slice(0, 6)
  const songs = [...songTotals.values()].sort((a, b) => b.seconds - a.seconds).slice(0, 6)
  const genres = [...genreTotals].sort((a, b) => b[1] - a[1]).slice(0, 5)

  return (
    <div className="dashboard-view">
      <div className="period-tabs" role="group" aria-label="Listening period">{periods.map((period) => <button key={period.label} className={days === period.days ? 'active' : ''} onClick={() => setDays(period.days)}>{period.label}</button>)}</div>
      <div className="stat-cards"><div><span>Observed listening</span><strong>{timeLabel(total)}</strong></div><div><span>Listening sessions</span><strong>{filtered.length}</strong></div><div><span>Artists</span><strong>{artistTotals.size}</strong></div></div>
      {filtered.length === 0 ? <div className="empty">Play songs in LyricFlow to build your private Music DNA.</div> : <>
        <section className="dashboard-card"><h2>Favorite artists</h2>{artists.map(([artist, seconds]) => <div className="stat-bar" key={artist}><span>{artist}</span><div><i style={{ width: `${Math.max(4, seconds / artists[0][1] * 100)}%` }} /></div><small>{timeLabel(seconds)}</small></div>)}</section>
        <section className="dashboard-card"><h2>Favorite songs</h2>{songs.map(({ entry, seconds }) => <button className="stat-song" key={entry.trackId} onClick={() => onOpen(entry)}><img src={entry.cover.startsWith('http') ? entry.cover : `${import.meta.env.BASE_URL}favicon.svg`} alt="" /><span><strong>{entry.title}</strong><small>{entry.artist}</small></span><em>{timeLabel(seconds)}</em></button>)}</section>
        <section className="dashboard-card"><h2>Genres</h2>{genres.length ? genres.map(([genre, seconds]) => <div className="stat-bar" key={genre}><span>{genre}</span><div><i style={{ width: `${Math.max(4, seconds / genres[0][1] * 100)}%` }} /></div><small>{timeLabel(seconds)}</small></div>) : <p className="muted small">Genre metadata is not available for these tracks.</p>}</section>
      </>}
      <p className="muted small">Stats count playback observed by this browser. Spotify does not provide LyricFlow with your past listening history.</p>
    </div>
  )
}
