import type { VercelRequest, VercelResponse } from '@vercel/node'
import { AudioFindError, findAudioSource } from '../../shared/audio-find.mjs'

const MAX_QUERY_LENGTH = 300

function respond(res: VercelResponse, status: number, body: unknown) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.status(status).json(body)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return respond(res, 204, null)
  if (req.method !== 'GET') return respond(res, 405, { error: 'Method Not Allowed' })

  const rawQuery = Array.isArray(req.query.q) ? req.query.q[0] : req.query.q
  const q = typeof rawQuery === 'string' ? rawQuery.trim() : ''

  if (!q) return respond(res, 400, { error: 'Missing query' })
  if (q.length > MAX_QUERY_LENGTH) return respond(res, 400, { error: 'Query is too long' })

  try {
    const source = await findAudioSource(q, { youtubeApiKey: process.env.YOUTUBE_API_KEY })
    return respond(res, 200, source)
  } catch (error) {
    if (error instanceof AudioFindError) {
      return respond(res, error.statusCode, { error: error.message })
    }
    return respond(res, 502, { error: 'Audio source lookup failed' })
  }
}
