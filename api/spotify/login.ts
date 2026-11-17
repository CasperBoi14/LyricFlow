import type { VercelRequest, VercelResponse } from '@vercel/node'
import { spotifyAuthorizeUrl } from '../../shared/spotify-token.mjs'

function respond(res: VercelResponse, status: number, body: unknown) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.status(status).json(body)
}

function queryValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || ''
  return value || ''
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return respond(res, 204, null)
  if (req.method !== 'GET') return respond(res, 405, { error: 'Method Not Allowed' })

  const url = spotifyAuthorizeUrl({
    clientId: process.env.SPOTIFY_CLIENT_ID,
    redirectUri: queryValue(req.query.redirect_uri),
    state: queryValue(req.query.state),
    codeChallenge: queryValue(req.query.challenge),
  })

  if (!url) return respond(res, 503, { error: 'Spotify is not configured on the server' })
  return respond(res, 200, { url })
}
