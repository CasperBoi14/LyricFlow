import { useMemo, useState } from 'react'
import type { HistoryEntry } from '../lib/listeningHistory'

const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export function MusicTimeline({ history, onOpen }: { history: HistoryEntry[]; onOpen: (entry: HistoryEntry) => void }) {
  const [today] = useState(() => dateKey(new Date()))
  const [day, setDay] = useState(today)
  const entries = useMemo(() => history.filter((entry) => dateKey(new Date(entry.startedAt)) === day).slice().reverse(), [history, day])
  const move = (delta: number) => {
    const date = new Date(`${day}T12:00:00`)
    date.setDate(date.getDate() + delta)
    setDay(dateKey(date))
  }
  return (
    <div className="timeline-view">
      <div className="timeline-nav"><button className="btn small" onClick={() => move(-1)}>← Previous</button><input type="date" value={day} max={today} onChange={(event) => setDay(event.target.value)} aria-label="Listening date" /><button className="btn small" onClick={() => move(1)} disabled={day >= today}>Next →</button></div>
      {entries.length ? <div className="timeline-list">{entries.map((entry) => <button className="timeline-entry" key={entry.id} onClick={() => onOpen(entry)}><time dateTime={new Date(entry.startedAt).toISOString()}>{new Date(entry.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time><div className="timeline-art" style={{ backgroundImage: entry.cover.startsWith('http') ? `url(${entry.cover})` : undefined }} /><span><strong>{entry.title}</strong><small>{entry.artist} · {Math.round(entry.seconds)} observed seconds</small></span><span aria-hidden="true">▶</span></button>)}</div> : <div className="empty">No listening recorded for this day on this device.</div>}
      <p className="muted small">This timeline is saved only in this browser. It starts when LyricFlow observes playback and cannot import older Spotify history.</p>
    </div>
  )
}
