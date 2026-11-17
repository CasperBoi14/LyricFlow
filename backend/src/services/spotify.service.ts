import { config } from '../config/env.js'
import { HttpError } from '../lib/errors.js'
import { fetchWithTimeout } from '../lib/fetch.js'

const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token'
const TOKEN_TIMEOUT_MS = 10_000
const ALLOWED_FIELDS = ['code', 'redirect_uri', 'code_verifier', 'refresh_token', 'scope'] as const
const SUPPORTED_GRANTS = new Set(['authorization_code', 'refresh_token', 'client_credentials'])

export type SpotifyTokenResult = {
  statusCode: number
  body: unknown
}

function fail(statusCode: number, error: string, description: string): SpotifyTokenResult {
  return { statusCode, body: { error, error_description: description } }
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export async function exchangeSpotifyToken(body: Record<string, unknown>): Promise<SpotifyTokenResult> {
  const grantType = readString(body.grant_type)
  if (!grantType) return fail(400, 'invalid_request', 'grant_type is required')
  if (!SUPPORTED_GRANTS.has(grantType)) {
    return fail(400, 'unsupported_grant_type', 'Unsupported grant_type')
  }

  const clientId = config.spotifyClientId || readString(body.client_id)
  const clientSecret = config.spotifyClientSecret

  if (clientSecret && !clientId) {
    return fail(503, 'server_misconfigured', 'Spotify client credentials are incomplete')
  }
  if (!clientSecret && !clientId) {
    return fail(503, 'server_misconfigured', 'Spotify is not configured on the server')
  }
  if (grantType === 'client_credentials' && !clientSecret) {
    return fail(503, 'server_misconfigured', 'Spotify client credentials are not configured')
  }

  const form = new URLSearchParams()
  form.set('grant_type', grantType)
  for (const field of ALLOWED_FIELDS) {
    const value = readString(body[field])
    if (value) form.set(field, value)
  }

  if (grantType === 'authorization_code') {
    if (!form.get('code') || !form.get('redirect_uri')) {
      return fail(400, 'invalid_request', 'code and redirect_uri are required')
    }
  }
  if (grantType === 'refresh_token' && !form.get('refresh_token')) {
    return fail(400, 'invalid_request', 'refresh_token is required')
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/x-www-form-urlencoded',
  }

  if (clientSecret) {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64')}`
  } else {
    form.set('client_id', clientId)
  }

  try {
    const response = await fetchWithTimeout(
      SPOTIFY_TOKEN_URL,
      {
        method: 'POST',
        headers,
        body: form.toString(),
      },
      TOKEN_TIMEOUT_MS,
    )

    const data: unknown = await response.json().catch(() => null)
    if (!data || typeof data !== 'object') {
      return fail(502, 'token_exchange_failed', 'Spotify returned an invalid response')
    }

    if (!response.ok) {
      return { statusCode: response.status, body: data }
    }

    if (typeof (data as { access_token?: unknown }).access_token !== 'string') {
      return fail(502, 'token_exchange_failed', 'Spotify response did not include an access token')
    }

    return { statusCode: 200, body: data }
  } catch (error) {
    if (error instanceof HttpError && error.statusCode === 504) {
      return fail(504, 'token_exchange_timeout', 'Spotify token request timed out')
    }
    return fail(502, 'token_exchange_failed', 'Spotify token request failed')
  }
}
