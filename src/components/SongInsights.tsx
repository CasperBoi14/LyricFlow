import { useMemo, useState } from 'react'
import type { Track } from '../types'
import { formatTime } from '../lib/lyrics'

const common = new Set('about above after again all also and are been before but can could did does for from had has have her him his how into its just like love more not now our out over she some than that the their them there these they this through time was were what when where which who will with would you your'.split(' '))

export function SongInsights({ track }: { track: Track | null }) {
  const [aiResult, setAiResult] = useState<{ id: string; text: string } | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const keywords = useMemo(() => {
    if (!track || track.lyrics.length < 2) return []
    const counts = new Map<string, number>()
    for (const word of track.lyrics.map((line) => line.text).join(' ').toLowerCase().match(/[\p{L}]{4,}/gu) || []) {
      if (!common.has(word)) counts.set(word, (counts.get(word) || 0) + 1)
    }
    return [...counts].filter(([, count]) => count > 1).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([word]) => word)
  }, [track])
  if (!track) return null

  const generate = async () => {
    const model = (window as any).LanguageModel
    if (!model?.availability || !model?.create) { setAiError('On-device AI is not available in this browser.'); return }
    setGenerating(true)
    setAiError(null)
    try {
      const available = await model.availability()
      if (available === 'unavailable') throw new Error('On-device AI is unavailable on this device.')
      const session = await model.create()
      try {
        const excerpt = track.lyrics.map((line) => line.text).join(' ').slice(0, 850)
        const text = await session.prompt(`Briefly interpret possible themes of this song in 2 sentences. Treat interpretations as possibilities, not facts. Do not quote lyrics or invent artist biography. Song: ${track.title} by ${track.artist}. Album: ${track.album}. Short lyric excerpt: ${excerpt}`)
        setAiResult({ id: track.id, text: String(text).slice(0, 700) })
      } finally { session.destroy?.() }
    } catch (error) { setAiError(error instanceof Error ? error.message : 'AI interpretation failed.') }
    finally { setGenerating(false) }
  }

  return <section className="song-insights"><div className="section-title">Song insights</div><h3>{track.title}</h3><p>{track.artist} · {track.album}</p><div className="insight-facts"><span>{formatTime(track.duration)}</span><span>{track.source}</span><span>{track.synced ? 'Timed lyrics' : 'Line timing estimated'}</span></div>
    {keywords.length > 0 && <><div className="section-title">Words that recur</div><div className="insight-tags">{keywords.map((word) => <span key={word}>{word}</span>)}</div><p className="muted small">These are word counts, not an interpretation of the song.</p></>}
    <button className="btn small" onClick={() => void generate()} disabled={generating}>{generating ? 'Generating on this device…' : 'Generate AI interpretation'}</button>
    {aiResult?.id === track.id && <div className="ai-insight"><strong>AI-generated interpretation</strong><p>{aiResult.text}</p><small>May be inaccurate. Factual song details are shown above.</small></div>}
    {aiError && <p className="muted small">{aiError}</p>}
  </section>
}
