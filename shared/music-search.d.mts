export type MusicSearchResult = {
  id: number | string
  title: string
  artist: string
  album: string
  duration: number
  cover: string
  previewUrl: string
  externalUrl: string
  source: 'itunes'
}

export type MusicSearchResponse = {
  results: MusicSearchResult[]
}

export type MusicSearchOptions = {
  limit?: number
  timeoutMs?: number
}

export declare class MusicSearchError extends Error {
  statusCode: number
  constructor(statusCode: number, message: string)
}

export declare function searchMusic(
  query: string,
  options?: MusicSearchOptions,
): Promise<MusicSearchResponse>
