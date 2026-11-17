#!/usr/bin/env node
import http from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AudioFindError, findAudioSource } from './shared/audio-find.mjs'
import { IdentifyError, identifySong } from './shared/identify.mjs'
import { getLyrics, LyricsError, searchLyrics } from './shared/lyrics.mjs'
import { MusicSearchError, searchMusic } from './shared/music-search.mjs'
import { exchangeSpotifyToken, spotifyAuthorizeUrl, spotifyPublicConfig } from './shared/spotify-token.mjs'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.resolve(process.env.STATIC_DIR || path.join(ROOT, 'dist'))
const PORT = Number(process.env.PORT) || 8787
const HOST = process.env.HOST || '0.0.0.0'
const BODY_LIMIT = 25 * 1024 * 1024
const CORS_ORIGINS = new Set((process.env.CORS_ORIGIN || 'https://casperboi14.github.io,http://127.0.0.1:5173,http://localhost:5173')
  .split(',').map((origin) => origin.trim()).filter(Boolean))

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

function setCors(req, res) {
  const origin = req.headers.origin
  if (origin && (CORS_ORIGINS.has(origin) || CORS_ORIGINS.has('*'))) {
    res.setHeader('Access-Control-Allow-Origin', CORS_ORIGINS.has('*') ? '*' : origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Max-Age', '86400')
}

function json(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  })
  res.end(payload)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > BODY_LIMIT) {
        reject(Object.assign(new Error('Payload too large'), { status: 413 }))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

async function readJson(req) {
  const raw = await readBody(req)
  if (!raw.length) return {}
  return JSON.parse(raw.toString('utf8'))
}

async function spotifyToken(req, res) {
  const body = await readJson(req)
  const result = await exchangeSpotifyToken(body, {
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  })
  return json(res, result.statusCode, result.body)
}

async function identify(req, res) {
  const body = await readJson(req)
  const sample = typeof body?.sample === 'string' ? body.sample : ''
  try {
    return json(res, 200, await identifySong(sample))
  } catch (error) {
    const status = error instanceof IdentifyError ? error.statusCode : 502
    return json(res, status, { error: error?.message || 'Recognition failed' })
  }
}

async function handleApi(req, res, url) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return true
  }

  if (url.pathname === '/api/health') {
    json(res, 200, { ok: true, service: 'lyricflow', time: new Date().toISOString() })
    return true
  }

  if (url.pathname === '/api/audio/find') {
    if (req.method !== 'GET') return json(res, 405, { error: 'Method Not Allowed' }), true
    const q = (url.searchParams.get('q') || '').trim()
    if (!q) return json(res, 400, { error: 'Missing query' }), true
    try {
      const source = await findAudioSource(q)
      return json(res, 200, source), true
    } catch (error) {
      const status = error instanceof AudioFindError ? error.statusCode : 502
      return json(res, status, { error: error?.message || 'Audio source lookup failed' }), true
    }
  }

  if (url.pathname === '/api/music/search') {
    if (req.method !== 'GET') return json(res, 405, { error: 'Method Not Allowed' }), true
    const q = (url.searchParams.get('q') || '').trim()
    try {
      return json(res, 200, await searchMusic(q)), true
    } catch (error) {
      const status = error instanceof MusicSearchError ? error.statusCode : 502
      return json(res, status, { error: error?.message || 'Music search failed' }), true
    }
  }

  if (url.pathname === '/api/lyrics/search') {
    if (req.method !== 'GET') return json(res, 405, { error: 'Method Not Allowed' }), true
    const q = (url.searchParams.get('q') || '').trim()
    try {
      res.setHeader('X-Lyrics-Provider', 'LRCLIB')
      return json(res, 200, await searchLyrics(q)), true
    } catch (error) {
      const status = error instanceof LyricsError ? error.statusCode : 502
      return json(res, status, { error: error?.message || 'Lyrics search failed' }), true
    }
  }

  if (url.pathname === '/api/lyrics/get') {
    if (req.method !== 'GET') return json(res, 405, { error: 'Method Not Allowed' }), true
    const params = {}
    for (const key of ['id', 'artist_name', 'track_name', 'album_name', 'duration']) {
      const value = url.searchParams.get(key)
      if (value !== null) params[key] = value
    }
    try {
      res.setHeader('X-Lyrics-Provider', 'LRCLIB')
      return json(res, 200, await getLyrics(params)), true
    } catch (error) {
      const status = error instanceof LyricsError ? error.statusCode : 502
      return json(res, status, { error: error?.message || 'Lyrics lookup failed' }), true
    }
  }

  if (url.pathname === '/api/spotify/config') {
    if (req.method !== 'GET') return json(res, 405, { error: 'Method Not Allowed' }), true
    return json(res, 200, spotifyPublicConfig({
      clientId: process.env.SPOTIFY_CLIENT_ID,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    })), true
  }

  if (url.pathname === '/api/spotify/login') {
    if (req.method !== 'GET') return json(res, 405, { error: 'Method Not Allowed' }), true
    const authorizeUrl = spotifyAuthorizeUrl({
      clientId: process.env.SPOTIFY_CLIENT_ID,
      redirectUri: url.searchParams.get('redirect_uri') || '',
      state: url.searchParams.get('state') || '',
      codeChallenge: url.searchParams.get('challenge') || '',
    })
    if (!authorizeUrl) return json(res, 503, { error: 'Spotify is not configured on the server' }), true
    return json(res, 200, { url: authorizeUrl }), true
  }

  if (url.pathname === '/api/spotify/token') {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method Not Allowed' }), true
    await spotifyToken(req, res)
    return true
  }

  if (url.pathname === '/api/identify') {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method Not Allowed' }), true
    await identify(req, res)
    return true
  }

  json(res, 404, { error: 'API route not found' })
  return true
}

async function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Method Not Allowed' })

  let pathname
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch {
    return json(res, 400, { error: 'Bad path' })
  }

  if (pathname.endsWith('/')) pathname += 'index.html'
  const filePath = path.resolve(DIST, `.${pathname}`)
  if (filePath !== DIST && !filePath.startsWith(DIST + path.sep)) return json(res, 403, { error: 'Forbidden' })

  try {
    const info = await stat(filePath)
    if (info.isDirectory()) return serveStatic(req, res, new URL(url.pathname + '/', url))
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    })
    if (req.method === 'HEAD') return res.end()
    createReadStream(filePath).pipe(res)
  } catch {
    try {
      const fallback = path.join(DIST, 'index.html')
      const info = await stat(fallback)
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Content-Length': info.size, 'Cache-Control': 'no-cache' })
      if (req.method === 'HEAD') return res.end()
      createReadStream(fallback).pipe(res)
    } catch {
      json(res, 404, { error: 'Not found. Run "npm run build" so the dist folder exists, or set STATIC_DIR.' })
    }
  }
}

const server = http.createServer(async (req, res) => {
  setCors(req, res)
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url)
      return
    }
    await serveStatic(req, res, url)
  } catch (error) {
    if (!res.headersSent) json(res, error?.status || 500, { error: error?.message || 'Server error' })
    else res.destroy()
  }
})

server.listen(PORT, HOST, () => {
  console.log(`LyricFlow server listening on http://${HOST}:${PORT}`)
  console.log(`Static files: ${DIST}`)
})
