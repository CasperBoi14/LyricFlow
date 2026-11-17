import type { VercelRequest, VercelResponse } from '@vercel/node'
import { exchangeSpotifyToken, type SpotifyTokenRequestBody } from '../../shared/spotify-token.mjs'

function respond(res: VercelResponse, status: number, body: unknown) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.status(status).json(body)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return respond(res, 204, null)
  if (req.method !== 'POST') return respond(res, 405, { error: 'Method Not Allowed' })

  const body =
    req.body && typeof req.body === 'object' && !Array.isArray(req.body)
      ? (req.body as SpotifyTokenRequestBody)
      : {}

  const result = await exchangeSpotifyToken(body, {
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  })

  return respond(res, result.statusCode, result.body)
}
