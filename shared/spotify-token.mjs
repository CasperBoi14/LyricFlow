const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token'
const DEFAULT_TIMEOUT_MS = 10_000

const ALLOWED_FIELDS = ['code', 'redirect_uri', 'code_verifier', 'refresh_token', 'scope']
const SUPPORTED_GRANTS = new Set(['authorization_code', 'refresh_token', 'client_credentials'])

function fail(statusCode, error, description) {
  return { statusCode, body: { error, error_description: description } }
}

function readString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export async function exchangeSpotifyToken(requestBody, options = {}) {
  if (!requestBody || typeof requestBody !== 'object' || Array.isArray(requestBody)) {
    return fail(400, 'invalid_request', 'A JSON token request body is required')
  }

  const grantType = readString(requestBody.grant_type)
  if (!grantType) return fail(400, 'invalid_request', 'grant_type is required')
  if (!SUPPORTED_GRANTS.has(grantType)) {
    return fail(400, 'unsupported_grant_type', 'Unsupported grant_type')
  }

  const envClientId = readString(options.clientId)
  const envClientSecret = readString(options.clientSecret)
  const bodyClientId = readString(requestBody.client_id)
  const clientId = envClientId || bodyClientId

  if (envClientSecret && !clientId) {
    return fail(503, 'server_misconfigured', 'Spotify client credentials are incomplete')
  }
  if (!envClientSecret && !clientId) {
    return fail(503, 'server_misconfigured', 'Spotify is not configured on the server')
  }
  if (grantType === 'client_credentials' && !envClientSecret) {
    return fail(503, 'server_misconfigured', 'Spotify client credentials are not configured')
  }

  const form = new URLSearchParams()
  form.set('grant_type', grantType)
  for (const field of ALLOWED_FIELDS) {
    const value = readString(requestBody[field])
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

  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/x-www-form-urlencoded',
  }

  if (envClientSecret) {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${envClientSecret}`, 'utf8').toString('base64')}`
  } else {
    form.set('client_id', clientId)
  }

  const timeoutMs =
    Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
      ? options.timeoutMs
      : DEFAULT_TIMEOUT_MS

  let response
  try {
    response = await fetch(SPOTIFY_TOKEN_URL, {
      method: 'POST',
      headers,
      body: form.toString(),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      return fail(504, 'token_exchange_timeout', 'Spotify token request timed out')
    }
    return fail(502, 'token_exchange_failed', 'Spotify token request failed')
  }

  const data = await response.json().catch(() => null)
  if (!data || typeof data !== 'object') {
    return fail(502, 'token_exchange_failed', 'Spotify returned an invalid response')
  }

  if (!response.ok) {
    return { statusCode: response.status, body: data }
  }

  if (typeof data.access_token !== 'string' || !data.access_token) {
    return fail(502, 'token_exchange_failed', 'Spotify response did not include an access token')
  }

  return { statusCode: 200, body: data }
}
