import type { VercelRequest, VercelResponse } from '@vercel/node'
import { spotifyPublicConfig } from '../../shared/spotify-token.mjs'

function respond(res: VercelResponse, status: number, body: unknown) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.status(status).json(body)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return respond(res, 204, null)
  if (req.method !== 'GET') return respond(res, 405, { error: 'Method Not Allowed' })

  return respond(
    res,
    200,
    spotifyPublicConfig({
      clientId: process.env.SPOTIFY_CLIENT_ID,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    }),
  )
}
