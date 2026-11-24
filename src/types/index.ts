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
  source: 'demo' | 'spotify' | 'search' | 'identify'
  externalUrl?: string
  audioUrl?: string
  spotifyUri?: string
  synced?: boolean
  instrumental?: boolean
}

export type AppView = 'library' | 'identify' | 'search' | 'lyrics' | 'settings' | 'dna' | 'timeline'

export type FullscreenLyricsMode = 'words' | 'line'
export type FullscreenStyle = 'classic' | 'dynamic'

export type SearchResult = {
  id: string
  title: string
  artist: string
  album: string
  duration: number
  cover: string
  source: Track['source']
  spotifyUri?: string
  externalUrl?: string
}
