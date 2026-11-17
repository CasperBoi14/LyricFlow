import { NoMatchesFoundError, Shazam, ShazamNetworkError } from 'shazamio-api'
import {
  BadRequestError,
  GatewayTimeoutError,
  HttpError,
  NotFoundError,
  UpstreamError,
} from '../lib/errors.js'

const shazam = new Shazam()

const RECOGNIZE_TIMEOUT_MS = 12_000
const MAX_AUDIO_BYTES = 10 * 1024 * 1024
const MIN_AUDIO_BYTES = 44
const DATA_URL_PREFIX = /^data:audio\/[a-z0-9.+-]+;base64,/i

export type IdentifyResult = {
  title: string
  artist: string
  album: string
  cover: string
  url: string
}

export function decodeWavSample(sampleBase64: string): Buffer {
  const encoded = sampleBase64.replace(DATA_URL_PREFIX, '').replace(/\s+/g, '')
  if (!encoded) throw new BadRequestError('Audio sample is empty')
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) {
    throw new BadRequestError('Audio sample is not valid base64')
  }

  const audio = Buffer.from(encoded, 'base64')
  if (audio.length === 0) throw new BadRequestError('Audio sample is empty')
  if (audio.length > MAX_AUDIO_BYTES) throw new BadRequestError('Audio sample is too large')
  if (audio.length < MIN_AUDIO_BYTES) throw new BadRequestError('Audio sample is too short')

  const hasRiffHeader = audio.subarray(0, 4).toString('ascii') === 'RIFF'
  const hasWaveHeader = audio.subarray(8, 12).toString('ascii') === 'WAVE'
  if (!hasRiffHeader || !hasWaveHeader) {
    throw new BadRequestError('Audio sample must be a RIFF/WAVE file')
  }
  if (!audio.includes('fmt ') || !audio.includes('data')) {
    throw new BadRequestError('Audio sample is not a valid WAV file')
  }

  return audio
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function mapTrack(track: Record<string, any> | undefined): IdentifyResult {
  if (!track || typeof track.title !== 'string' || !track.title) {
    throw new NotFoundError('No match found')
  }

  const actions: unknown[] = Array.isArray(track.hub?.actions) ? track.hub.actions : []
  const action = actions.find((item: any) => item?.type === 'uri') as { uri?: unknown } | undefined

  const sections: unknown[] = Array.isArray(track.sections) ? track.sections : []
  const songSection: any = sections.find((section: any) => section?.type === 'SONG')
  const metadata: unknown[] = Array.isArray(songSection?.metadata) ? songSection.metadata : []
  const albumEntry: any = metadata.find((item: any) => item?.title === 'Album')

  return {
    title: track.title,
    artist: readString(track.subtitle) || 'Unknown Artist',
    album: readString(albumEntry?.text),
    cover: readString(track.images?.coverart),
    url: readString(action?.uri),
  }
}

export async function identifySong(sampleBase64: string): Promise<IdentifyResult> {
  const audio = decodeWavSample(sampleBase64)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), RECOGNIZE_TIMEOUT_MS)

  try {
    const result = await shazam.recognize(audio, { signal: controller.signal })
    return mapTrack(result.track)
  } catch (error) {
    if (error instanceof HttpError) throw error
    if (controller.signal.aborted) {
      throw new GatewayTimeoutError('Recognition request timed out')
    }
    if (error instanceof NoMatchesFoundError) {
      throw new NotFoundError('No match found')
    }
    if (error instanceof ShazamNetworkError) {
      throw new UpstreamError('Recognition service unavailable')
    }
    throw new UpstreamError('Recognition failed')
  } finally {
    clearTimeout(timer)
  }
}
