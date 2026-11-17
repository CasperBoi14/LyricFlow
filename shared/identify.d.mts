export type IdentifyResult = {
  title: string
  artist: string
  album: string
  cover: string
  url: string
}

export type IdentifyOptions = {
  timeoutMs?: number
}

export declare class IdentifyError extends Error {
  statusCode: number
  constructor(statusCode: number, message: string)
}

export declare function decodeWavSample(sample: string): Buffer

export declare function identifySong(
  sample: string,
  options?: IdentifyOptions,
): Promise<IdentifyResult>
