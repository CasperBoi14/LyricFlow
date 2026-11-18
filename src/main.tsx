import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './redesign.css'
import App from './App.tsx'

// Spotify no longer accepts `localhost` as a redirect URI (HTTPS or a loopback IP such as
// 127.0.0.1 is required), so move the dev app to the loopback address before it starts.
const url = new URL(window.location.href)
if (url.hostname === 'localhost') {
  url.hostname = '127.0.0.1'
  window.location.replace(url.toString())
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
