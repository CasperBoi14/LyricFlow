export type AudioSource =
  | { youtubeId: string; cover: string }
  | { audioUrl: string; cover?: string }

export type FindAudioOptions = {
  timeoutMs?: number
}

export declare class AudioFindError extends Error {
  statusCode: number
  constructor(statusCode: number, message: string)
}

export declare function findAudioSource(
  query: string,
  options?: FindAudioOptions,
): Promise<AudioSource>
