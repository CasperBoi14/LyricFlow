import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getLyrics, LyricsError, type LyricsGetRequest } from '../../shared/lyrics.mjs'

function respond(res: VercelResponse, status: number, body: unknown) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('X-Lyrics-Provider', 'LRCLIB')
  res.status(status).json(body)
}

function readParam(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value
  return typeof raw === 'string' ? raw : undefined
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return respond(res, 204, null)
  if (req.method !== 'GET') return respond(res, 405, { error: 'Method Not Allowed' })

  const params: LyricsGetRequest = {}
  const id = readParam(req.query.id)
  const artistName = readParam(req.query.artist_name)
  const trackName = readParam(req.query.track_name)
  const albumName = readParam(req.query.album_name)
  const duration = readParam(req.query.duration)
  if (id !== undefined) params.id = id
  if (artistName !== undefined) params.artist_name = artistName
  if (trackName !== undefined) params.track_name = trackName
  if (albumName !== undefined) params.album_name = albumName
  if (duration !== undefined) params.duration = duration

  try {
    const data = await getLyrics(params)
    return respond(res, 200, data)
  } catch (error) {
    if (error instanceof LyricsError) {
      return respond(res, error.statusCode, { error: error.message })
    }
    return respond(res, 502, { error: 'Lyrics lookup failed' })
  }
}
