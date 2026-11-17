export type LyricsGetRequest = {
  id?: string | number
  artist_name?: string
  track_name?: string
  album_name?: string
  duration?: string | number
}

export type LyricsProviderOptions = {
  timeoutMs?: number
}

export declare class LyricsError extends Error {
  statusCode: number
  constructor(statusCode: number, message: string)
}

export declare function searchLyrics(
  query: string,
  options?: LyricsProviderOptions,
): Promise<Record<string, unknown>[]>

export declare function getLyrics(
  params?: LyricsGetRequest,
  options?: LyricsProviderOptions,
): Promise<Record<string, unknown>>
