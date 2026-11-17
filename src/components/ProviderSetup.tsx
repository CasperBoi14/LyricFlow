import { useState, type FormEvent } from 'react'
import { getAuddToken, getYouTubeApiKey, setAuddToken, setYouTubeApiKey } from '../lib/keys'

type Props = {
  video?: boolean
  recognition?: boolean
  onSaved?: () => void
}

export function ProviderSetup({ video = true, recognition = true, onSaved }: Props) {
  const [youtubeDraft, setYoutubeDraft] = useState(getYouTubeApiKey)
  const [auddDraft, setAuddDraft] = useState(getAuddToken)
  const [saved, setSaved] = useState(false)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (video) setYouTubeApiKey(youtubeDraft)
    if (recognition) setAuddToken(auddDraft)
    setSaved(true)
    onSaved?.()
    window.setTimeout(() => setSaved(false), 2500)
  }

  return (
    <form className="provider-setup" onSubmit={submit}>
      <div className="section-title">Audio providers</div>
      <p className="muted small">Full songs and mic recognition run in your browser — no API backend needed.</p>

      {video && (
        <label className="provider-field">
          <span>
            YouTube API key
            <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Free key</a>
          </span>
          <input
            className="add-input"
            type="password"
            value={youtubeDraft}
            onChange={(e) => setYoutubeDraft(e.target.value)}
            placeholder="AIza…"
            autoComplete="off"
            spellCheck={false}
          />
          <small className="muted">Plays full-length songs through the YouTube player.</small>
        </label>
      )}

      {recognition && (
        <label className="provider-field">
          <span>
            AudD token
            <a href="https://dashboard.audd.io/" target="_blank" rel="noreferrer">Free token</a>
          </span>
          <input
            className="add-input"
            type="password"
            value={auddDraft}
            onChange={(e) => setAuddDraft(e.target.value)}
            placeholder="Recognition API token"
            autoComplete="off"
            spellCheck={false}
          />
          <small className="muted">Identifies songs from the microphone.</small>
        </label>
      )}

      <div className="row">
        <button className="btn small primary" type="submit">Save</button>
        {saved && <span className="muted small">Saved</span>}
      </div>
    </form>
  )
}
