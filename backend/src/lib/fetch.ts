import { GatewayTimeoutError, UpstreamError } from './errors.js'

const DEFAULT_TIMEOUT_MS = 15_000

export async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const signal = init.signal ?? AbortSignal.timeout(timeoutMs)

  try {
    return await fetch(input, { ...init, signal })
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new GatewayTimeoutError('Upstream request timed out')
    }
    throw new UpstreamError('Upstream request failed')
  }
}
