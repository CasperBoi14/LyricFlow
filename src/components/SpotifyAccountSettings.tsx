import { useEffect, useState } from 'react'
import { getSpotifyClientId, getSpotifyServerConfig, hasSpotifyPlayback, spotifyRedirectTarget } from '../lib/spotify'

type Props = {
  connected: boolean
  connecting: boolean
  error: string | null
  deviceName?: string
  onConnect: (clientId?: string) => void
  onDisconnect: () => void
  onDismissError: () => void
}

export function SpotifyAccountSettings({ connected, connecting, error, deviceName, onConnect, onDisconnect, onDismissError }: Props) {
  const [clientId, setClientId] = useState(getSpotifyClientId)
  const [serverConfigured, setServerConfigured] = useState(false)

  useEffect(() => {
    let active = true
    void getSpotifyServerConfig().then((config) => { if (active) setServerConfigured(!!config?.configured) })
    return () => { active = false }
  }, [])

  return (
    <section className="settings-card spotify-settings">
      <div className="settings-heading"><h2>Spotify connection</h2><span className={connected ? 'status-dot connected' : 'status-dot'}>{connected ? 'Connected' : 'Not connected'}</span></div>
      {connected ? (
        <>
          <p className="muted small">{deviceName ? `Following ${deviceName}. ` : ''}{hasSpotifyPlayback() ? 'In-app playback is enabled.' : 'Reconnect to grant in-app playback access.'}</p>
          <div className="row wrap">
            <button className="btn spotify-btn" onClick={() => onConnect(serverConfigured ? undefined : clientId)} disabled={connecting}>Reconnect Spotify</button>
            <button className="btn ghost" onClick={onDisconnect}>Disconnect</button>
          </div>
        </>
      ) : (
        <>
          <p className="muted small">Connect to browse your Spotify playlists and follow the song playing on your phone. In-app Spotify playback needs Premium.</p>
          {!serverConfigured && <label className="settings-slider"><span>Spotify Client ID</span><input className="search" value={clientId} onChange={(event) => setClientId(event.target.value)} placeholder="Paste your Spotify Client ID" /></label>}
          <button className="btn primary spotify-connect" onClick={() => onConnect(serverConfigured ? undefined : clientId)} disabled={connecting || (!serverConfigured && !clientId.trim())}>{connecting ? 'Opening Spotify…' : 'Connect Spotify'}</button>
          <div className="redirect-box"><span className="muted small">Add this redirect URI to your Spotify app:</span><code>{spotifyRedirectTarget()}</code></div>
          <a className="link" href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">Spotify developer dashboard</a>
        </>
      )}
      {error && <div className="notice error">{error} <button className="link" onClick={onDismissError}>Dismiss</button></div>}
    </section>
  )
}
