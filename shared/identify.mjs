import { NoMatchesFoundError, Shazam, ShazamNetworkError } from 'shazamio-api'

const shazam = new Shazam()

const DEFAULT_TIMEOUT_MS = 12_000
const MAX_AUDIO_BYTES = 10 * 1024 * 1024
const MIN_AUDIO_BYTES = 44
const DATA_URL_PREFIX = /^data:audio\/[a-z0-9.+-]+;base64,/i

export class IdentifyError extends Error {
  constructor(statusCode, message) {
    super(message)
    this.name = 'IdentifyError'
    this.statusCode = statusCode
  }
}

export function decodeWavSample(sample) {
  if (typeof sample !== 'string') throw new IdentifyError(400, 'sample must be a base64 WAV string')

  const encoded = sample.replace(DATA_URL_PREFIX, '').replace(/\s+/g, '')
  if (!encoded) throw new IdentifyError(400, 'Audio sample is empty')
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) {
    throw new IdentifyError(400, 'Audio sample is not valid base64')
  }

  const audio = Buffer.from(encoded, 'base64')
  if (audio.length === 0) throw new IdentifyError(400, 'Audio sample is empty')
  if (audio.length > MAX_AUDIO_BYTES) throw new IdentifyError(413, 'Audio sample is too large')
  if (audio.length < MIN_AUDIO_BYTES) throw new IdentifyError(400, 'Audio sample is too short')

  const hasRiffHeader = audio.subarray(0, 4).toString('ascii') === 'RIFF'
  const hasWaveHeader = audio.subarray(8, 12).toString('ascii') === 'WAVE'
  if (!hasRiffHeader || !hasWaveHeader) {
    throw new IdentifyError(400, 'Audio sample must be a RIFF/WAVE file')
  }

  const header = audio.subarray(0, Math.min(audio.length, 256)).toString('latin1')
  if (!header.includes('fmt ') || !header.includes('data')) {
    throw new IdentifyError(400, 'Audio sample is not a valid WAV file')
  }

  return audio
}

function readString(value) {
  return typeof value === 'string' ? value : ''
}

function mapTrack(track) {
  if (!track || typeof track !== 'object' || typeof track.title !== 'string' || !track.title) {
    throw new IdentifyError(404, 'No match found')
  }

  const actions = Array.isArray(track.hub?.actions) ? track.hub.actions : []
  const action = actions.find((item) => item?.type === 'uri')

  const sections = Array.isArray(track.sections) ? track.sections : []
  const songSection = sections.find((section) => section?.type === 'SONG')
  const metadata = Array.isArray(songSection?.metadata) ? songSection.metadata : []
  const albumEntry = metadata.find((item) => item?.title === 'Album')

  return {
    title: track.title,
    artist: readString(track.subtitle) || 'Unknown Artist',
    album: readString(albumEntry?.text),
    cover: readString(track.images?.coverart),
    url: readString(action?.uri),
  }
}

export async function identifySong(sample, options = {}) {
  const audio = decodeWavSample(sample)
  const timeoutMs =
    Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
      ? options.timeoutMs
      : DEFAULT_TIMEOUT_MS

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const result = await shazam.recognize(audio, { signal: controller.signal })
    return mapTrack(result?.track)
  } catch (error) {
    if (error instanceof IdentifyError) throw error
    if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
      throw new IdentifyError(504, 'Recognition request timed out')
    }
    if (error instanceof NoMatchesFoundError) {
      throw new IdentifyError(404, 'No match found')
    }
    if (error instanceof ShazamNetworkError) {
      throw new IdentifyError(502, 'Recognition service unavailable')
    }
    throw new IdentifyError(502, 'Recognition failed')
  } finally {
    clearTimeout(timer)
  }
}
