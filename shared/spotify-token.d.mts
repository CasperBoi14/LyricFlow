export type SpotifyTokenRequestBody = {
  grant_type?: string
  code?: string
  redirect_uri?: string
  code_verifier?: string
  refresh_token?: string
  scope?: string
  client_id?: string
  [key: string]: unknown
}

export type SpotifyTokenOptions = {
  clientId?: string
  clientSecret?: string
  timeoutMs?: number
}

export type SpotifyTokenResponse = {
  access_token?: string
  token_type?: string
  expires_in?: number
  refresh_token?: string
  scope?: string
  [key: string]: unknown
}

export type SpotifyTokenResult = {
  statusCode: number
  body: SpotifyTokenResponse | { error: string; error_description: string }
}

export type SpotifyPublicConfig = {
  configured: boolean
  clientId: string | null
  serverTokenExchange: boolean
}

export declare function spotifyPublicConfig(options?: SpotifyTokenOptions): SpotifyPublicConfig

export declare function exchangeSpotifyToken(
  requestBody: SpotifyTokenRequestBody,
  options?: SpotifyTokenOptions,
): Promise<SpotifyTokenResult>
