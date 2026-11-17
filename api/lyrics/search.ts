import type { VercelRequest, VercelResponse } from '@vercel/node'
import { LyricsError, searchLyrics } from '../../shared/lyrics.mjs'

function respond(res: VercelResponse, status: number, body: unknown) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('X-Lyrics-Provider', 'LRCLIB')
  res.status(status).json(body)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return respond(res, 204, null)
  if (req.method !== 'GET') return respond(res, 405, { error: 'Method Not Allowed' })

  const rawQuery = Array.isArray(req.query.q) ? req.query.q[0] : req.query.q
  const q = typeof rawQuery === 'string' ? rawQuery.trim() : ''
  if (!q) return respond(res, 400, { error: 'Missing query' })

  try {
    const data = await searchLyrics(q)
    return respond(res, 200, data)
  } catch (error) {
    if (error instanceof LyricsError) {
      return respond(res, error.statusCode, { error: error.message })
    }
    return respond(res, 502, { error: 'Lyrics search failed' })
  }
}
