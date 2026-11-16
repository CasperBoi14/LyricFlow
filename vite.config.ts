import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { Shazam, NoMatchesFoundError } from 'shazamio-api'

const shazam = new Shazam()

function readJson(req: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')) } catch (e) { reject(e) } })
    req.on('error', reject)
  })
}
const send = (res: any, code: number, obj: any) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)) }

function apiPlugin(): Plugin {
  return {
    name: 'lyricflow-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || ''
        try {
          if (url.startsWith('/api/spotify/token')) {
            if (req.method !== 'POST') { send(res, 405, { error: 'Method Not Allowed' }); return }
            const body = await readJson(req)
            const form = new URLSearchParams()
            for (const [k, v] of Object.entries(body || {})) {
              if (v != null) form.set(k, String(v))
            }
            const r = await fetch('https://accounts.spotify.com/api/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: form.toString(),
            })
            send(res, r.status, await r.json().catch(() => ({ error: 'token_exchange_failed' }))); return
          }
          if (url.startsWith('/api/lyrics/search')) {
            const q = new URL(url, 'http://x').searchParams.get('q') || ''
            const r = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`, { headers: { 'User-Agent': 'Lyricflow/1.0' } })
            send(res, r.status, await r.json().catch(()=>[])); return
          }
          if (url.startsWith('/api/lyrics/get')) {
            const sp = new URL(url, 'http://x').searchParams
            const r = await fetch(`https://lrclib.net/api/get?${sp.toString()}`, { headers: { 'User-Agent': 'Lyricflow/1.0' } })
            if (!r.ok) { send(res, r.status, { error: 'not found' }); return }
            send(res, 200, await r.json()); return
          }
          if (url.startsWith('/api/music/search')) {
            const q = new URL(url, 'http://x').searchParams.get('q') || ''
            const r = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=20`)
            send(res, r.status, await r.json().catch(()=>({results:[]}))); return
          }
          if (url.startsWith('/api/audio/find')) {
            const q = new URL(url, 'http://x').searchParams.get('q') || ''
            if (!q) { send(res, 400, { error: 'Missing query' }); return }
            const r = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIQAQ%253D%253D`, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
              },
            })
            const html = await r.text()
            const m = html.match(/"videoRenderer":\{"videoId":"([\w-]{11})"/)
            if (!m) { send(res, 404, { error: 'No playable track found' }); return }
            send(res, 200, { videoId: m[1], thumbnail: `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg` }); return
          }
          if (url.startsWith('/api/identify')) {
            if (req.method !== 'POST') { send(res, 405, { error: 'Method Not Allowed' }); return }
            const body = await readJson(req)
            const sample = body?.sample as string
            if (!sample) { send(res, 400, { error: 'No audio sample' }); return }
            const buf = Buffer.from(sample, 'base64')
            try {
              const result = await shazam.recognize(buf)
              const track: any = result?.track
              if (!track?.title) { send(res, 404, { error: 'No match found' }); return }
              const action = (track.hub?.actions || []).find((a: any) => a?.type === 'uri')
              send(res, 200, {
                title: track.title,
                artist: track.subtitle || 'Unknown Artist',
                album: track.sections?.find((s: any) => s?.type === 'SONG')?.metadata?.find((m: any) => m?.title === 'Album')?.text || '',
                cover: track.images?.coverart || '',
                url: action?.uri || '',
                provider: 'shazam',
              }); return
            } catch (e: any) {
              if (e instanceof NoMatchesFoundError) { send(res, 404, { error: 'No match found' }); return }
              send(res, 502, { error: e?.message || 'Shazam recognition failed' }); return
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
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/lyricflow/' : '/',
  plugins: [react(), apiPlugin()],
})

