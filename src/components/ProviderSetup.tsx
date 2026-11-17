import { useState, type FormEvent } from 'react'
import { getAuddToken, setAuddToken } from '../lib/keys'

type Props = {
  onSaved?: () => void
}

export function ProviderSetup({ onSaved }: Props) {
  const [auddDraft, setAuddDraft] = useState(getAuddToken)
  const [saved, setSaved] = useState(false)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setAuddToken(auddDraft)
    setSaved(true)
    onSaved?.()
    window.setTimeout(() => setSaved(false), 2500)
  }

  return (
    <form className="provider-setup" onSubmit={submit}>
      <div className="section-title">Song recognition</div>
      <p className="muted small">Microphone recognition runs in your browser — no API backend needed.</p>

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

      <div className="row">
        <button className="btn small primary" type="submit">Save</button>
        {saved && <span className="muted small">Saved</span>}
      </div>
    </form>
  )
}
