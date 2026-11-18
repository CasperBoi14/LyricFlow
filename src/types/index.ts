export type TimedWord = {
  t: number
  text: string
}

export type LyricLine = {
  time: number
  text: string
  words?: TimedWord[]
  translation?: Record<string, string>
}

export type Track = {
  id: string
  title: string
  artist: string
  album: string
  duration: number
  cover: string
  accent?: string
  tags: string[]
  lyrics: LyricLine[]
  source: 'demo' | 'spotify' | 'youtube' | 'search' | 'identify'
  externalUrl?: string
  youtubeId?: string
  audioUrl?: string
  spotifyUri?: string
  synced?: boolean
  instrumental?: boolean
}

export type AdState = {
  /** Seconds left in the ad, 0 when the player will not reveal the ad length. */
  remaining: number
  /** Total ad length in seconds, 0 when unknown. */
  total: number
}

export type AppView = 'library' | 'identify' | 'search' | 'settings'

export type SearchResult = {
  id: string
  title: string
  artist: string
  album: string
  duration: number
  cover: string
  source: Track['source']
  youtubeId?: string
  spotifyUri?: string
  externalUrl?: string
}
