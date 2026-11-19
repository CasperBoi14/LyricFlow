import { useEffect, useState } from 'react'
import { getSpotifyClientId, getSpotifyDevices, getSpotifyServerConfig, hasSpotifyNativeBridge, hasSpotifyPlayback, spotifyRedirectTarget, transferSpotifyPlayback, type SpotifyDevice } from '../lib/spotify'

type Props = {
  connected: boolean
  connecting: boolean
  error: string | null
  deviceName?: string
  onConnect: (clientId?: string, mode?: 'app' | 'web') => void
  onDisconnect: () => void
  onDismissError: () => void
  onTransferred: () => void
}

export function SpotifyAccountSettings({ connected, connecting, error, deviceName, onConnect, onDisconnect, onDismissError, onTransferred }: Props) {
  const [clientId, setClientId] = useState(getSpotifyClientId)
  const [serverConfigured, setServerConfigured] = useState(false)
  const [devices, setDevices] = useState<SpotifyDevice[]>([])
  const [deviceError, setDeviceError] = useState<string | null>(null)
  const [moving, setMoving] = useState<string | null>(null)
  const nativeApp = hasSpotifyNativeBridge()
  const canConnect = !connecting && (serverConfigured || !!clientId.trim())
  const connect = (mode: 'app' | 'web' = 'web') => onConnect(serverConfigured ? undefined : clientId, mode)

  const refreshDevices = async () => {
    setDeviceError(null)
    try { setDevices(await getSpotifyDevices()) }
    catch (cause) { setDeviceError(cause instanceof Error ? cause.message : 'Could not load Spotify devices.') }
  }

  useEffect(() => { if (connected) void Promise.resolve().then(refreshDevices) }, [connected])

  const moveTo = async (device: SpotifyDevice) => {
    setMoving(device.id)
    setDeviceError(null)
    try {
      await transferSpotifyPlayback(device.id)
      onTransferred()
      await refreshDevices()
    } catch (cause) { setDeviceError(cause instanceof Error ? cause.message : 'Could not move playback.') }
    finally { setMoving(null) }
  }

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
            <button className="btn spotify-btn" onClick={() => connect(nativeApp ? 'app' : 'web')} disabled={!canConnect}>Reconnect Spotify</button>
            <button className="btn ghost" onClick={onDisconnect}>Disconnect</button>
          </div>
          <div className="spotify-device-list">
            <div className="settings-heading"><h3>Continue on a device</h3><button className="btn small ghost" onClick={() => void refreshDevices()}>Refresh devices</button></div>
            <p className="muted small">Choose your phone or speaker before closing this page. Spotify playback continues on that device.</p>
            {devices.map((device) => <button key={device.id} className="spotify-device" onClick={() => void moveTo(device)} disabled={!!moving || device.is_active}>
              <span><strong>{device.name}</strong><small>{device.type}</small></span><span>{moving === device.id ? 'Moving…' : device.is_active ? 'Active' : 'Play here'}</span>
            </button>)}
            {!devices.length && !deviceError && <p className="muted small">Open Spotify on your phone or speaker, then refresh devices.</p>}
            {deviceError && <p className="notice error">{deviceError}</p>}
          </div>
        </>
      ) : (
        <>
          <p className="muted small">Connect to browse your Spotify playlists and follow the song playing on your phone. In-app Spotify playback needs Premium.</p>
          {!serverConfigured && <label className="settings-slider"><span>Spotify Client ID</span><input className="search" value={clientId} onChange={(event) => setClientId(event.target.value)} placeholder="Paste your Spotify Client ID" /></label>}
          <div className="row wrap">
            {nativeApp && <button className="btn primary spotify-connect" onClick={() => connect('app')} disabled={!canConnect}>{connecting ? 'Connecting…' : 'Connect with Spotify app'}</button>}
            <button className={nativeApp ? 'btn spotify-connect' : 'btn primary spotify-connect'} onClick={() => connect('web')} disabled={!canConnect}>{connecting ? 'Opening Spotify…' : 'Log in on Spotify website'}</button>
          </div>
          {!nativeApp && <p className="muted small">This Safari page cannot receive authorization from the installed Spotify app. App-based sign-in requires the separate LyricFlow iPad app.</p>}
          {nativeApp && <p className="muted small">The app option uses Spotify's iOS sign-in and returns directly to LyricFlow.</p>}
          <div className="redirect-box"><span className="muted small">Add this exact URL under Redirect URIs in the Spotify Developer Dashboard. The Website field does not count:</span><code>{spotifyRedirectTarget()}</code></div>
          {nativeApp && <div className="redirect-box"><span className="muted small">Also add this iOS app redirect URI:</span><code>com.pxlwebworks.lyricflow://spotify-callback</code></div>}
          <a className="link" href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">Spotify developer dashboard</a>
        </>
      )}
      {error && <div className="notice error">{error} <button className="link" onClick={onDismissError}>Dismiss</button></div>}
    </section>
  )
}
