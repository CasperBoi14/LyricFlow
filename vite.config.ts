import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { AudioFindError, findAudioSource } from './shared/audio-find.mjs'
import { IdentifyError, identifySong } from './shared/identify.mjs'
import { getLyrics, LyricsError, searchLyrics } from './shared/lyrics.mjs'
import { MusicSearchError, searchMusic } from './shared/music-search.mjs'
import { exchangeSpotifyToken, spotifyAuthorizeUrl, spotifyPublicConfig } from './shared/spotify-token.mjs'

function readJson(req: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')) } catch (e) { reject(e) } })
    req.on('error', reject)
  })
}
const send = (res: any, code: number, obj: any) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)) }
const sendError = (res: any, error: any, fallback: string) => {
  const status = typeof error?.statusCode === 'number' ? error.statusCode : 502
  send(res, status, { error: error?.message || fallback })
}

function apiPlugin(spotify: { clientId: string; clientSecret: string }): Plugin {
  return {
    name: 'lyricflow-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || ''
        try {
          if (url.startsWith('/api/spotify/config')) {
            if (req.method !== 'GET') { send(res, 405, { error: 'Method Not Allowed' }); return }
            send(res, 200, spotifyPublicConfig({
              clientId: spotify.clientId,
              clientSecret: spotify.clientSecret,
            })); return
          }
          if (url.startsWith('/api/spotify/login')) {
            if (req.method !== 'GET') { send(res, 405, { error: 'Method Not Allowed' }); return }
            const sp = new URL(url, 'http://x').searchParams
            const authorizeUrl = spotifyAuthorizeUrl({
              clientId: spotify.clientId,
              redirectUri: sp.get('redirect_uri') || '',
              state: sp.get('state') || '',
              codeChallenge: sp.get('challenge') || '',
            })
            if (!authorizeUrl) { send(res, 503, { error: 'Spotify is not configured on the server' }); return }
            send(res, 200, { url: authorizeUrl }); return
          }
          if (url.startsWith('/api/spotify/token')) {
            if (req.method !== 'POST') { send(res, 405, { error: 'Method Not Allowed' }); return }
            const body = await readJson(req)
            const result = await exchangeSpotifyToken(body, {
              clientId: spotify.clientId,
              clientSecret: spotify.clientSecret,
            })
            send(res, result.statusCode, result.body); return
          }
          if (url.startsWith('/api/lyrics/search')) {
            if (req.method !== 'GET') { send(res, 405, { error: 'Method Not Allowed' }); return }
            const q = (new URL(url, 'http://x').searchParams.get('q') || '').trim()
            try {
              const data = await searchLyrics(q)
              res.setHeader('X-Lyrics-Provider', 'LRCLIB')
              send(res, 200, data); return
            } catch (e: any) {
              sendError(res, e instanceof LyricsError ? e : null, 'Lyrics search failed'); return
            }
          }
          if (url.startsWith('/api/lyrics/get')) {
            if (req.method !== 'GET') { send(res, 405, { error: 'Method Not Allowed' }); return }
            const sp = new URL(url, 'http://x').searchParams
            const params: Record<string, string> = {}
            for (const key of ['id', 'artist_name', 'track_name', 'album_name', 'duration']) {
              const value = sp.get(key)
              if (value !== null) params[key] = value
            }
            try {
              const data = await getLyrics(params)
              res.setHeader('X-Lyrics-Provider', 'LRCLIB')
              send(res, 200, data); return
            } catch (e: any) {
              sendError(res, e instanceof LyricsError ? e : null, 'Lyrics lookup failed'); return
            }
          }
          if (url.startsWith('/api/music/search')) {
            if (req.method !== 'GET') { send(res, 405, { error: 'Method Not Allowed' }); return }
            const q = (new URL(url, 'http://x').searchParams.get('q') || '').trim()
            try {
              send(res, 200, await searchMusic(q)); return
            } catch (e: any) {
              sendError(res, e instanceof MusicSearchError ? e : null, 'Music search failed'); return
            }
          }
          if (url.startsWith('/api/audio/find')) {
            if (req.method !== 'GET') { send(res, 405, { error: 'Method Not Allowed' }); return }
            const q = (new URL(url, 'http://x').searchParams.get('q') || '').trim()
            if (!q) { send(res, 400, { error: 'Missing query' }); return }
            try {
              const source = await findAudioSource(q)
              send(res, 200, source); return
            } catch (e: any) {
              const status = e instanceof AudioFindError ? e.statusCode : 502
              send(res, status, { error: e?.message || 'Audio source lookup failed' }); return
            }
          }
          if (url.startsWith('/api/identify')) {
            if (req.method !== 'POST') { send(res, 405, { error: 'Method Not Allowed' }); return }
            const body = await readJson(req)
            const sample = typeof body?.sample === 'string' ? body.sample : ''
            try {
              send(res, 200, await identifySong(sample)); return
            } catch (e: any) {
              sendError(res, e instanceof IdentifyError ? e : null, 'Recognition failed'); return
            }
          }
        } catch (e: any) {
          send(res, 500, { error: e.message || 'API error' }); return
        }
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, process.cwd(), '')
  const backendEnv = loadEnv(mode, path.resolve(process.cwd(), 'backend'), '')
  const envValue = (name: string) => process.env[name] || rootEnv[name] || backendEnv[name] || ''

  return {
    root: 'src',
    envDir: process.cwd(),
    publicDir: '../public',
    // Spotify only accepts HTTPS or a loopback IP as a redirect URI, never `localhost`.
    server: { host: '127.0.0.1' },
    base: process.env.GITHUB_ACTIONS ? '/LyricFlow/' : '/',
    build: {
      outDir: '../dist',
      emptyOutDir: true,
    },
    plugins: [
      react(),
      apiPlugin({
        clientId: envValue('SPOTIFY_CLIENT_ID'),
        clientSecret: envValue('SPOTIFY_CLIENT_SECRET'),
      }),
    ],
  }
})

