import type { VercelRequest, VercelResponse } from '@vercel/node'
import { identifySong, IdentifyError } from '../shared/identify.mjs'

function respond(res: VercelResponse, status: number, body: unknown) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.status(status).json(body)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') return respond(res, 204, null)
  if (req.method !== 'POST') return respond(res, 405, { error: 'Method Not Allowed' })

  const sample = typeof req.body?.sample === 'string' ? req.body.sample : ''

  try {
    const match = await identifySong(sample)
    return respond(res, 200, match)
  } catch (error) {
    if (error instanceof IdentifyError) {
      return respond(res, error.statusCode, { error: error.message })
    }
    return respond(res, 502, { error: 'Recognition failed' })
  }
}
