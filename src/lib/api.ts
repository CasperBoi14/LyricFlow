const configuredBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '')

export const apiBaseUrl = configuredBase || ''

export const hasBackend = Boolean(apiBaseUrl) || import.meta.env.DEV

export function apiUrl(path: string): string {
  return `${apiBaseUrl}${path}`
}

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), init)
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const error = data as { error?: string; message?: string } | null
    throw new ApiError(error?.error || error?.message || `Request failed (${res.status})`, res.status)
  }
  return data as T
}

export async function checkBackend(): Promise<boolean> {
  if (!hasBackend) return false
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    const res = await fetch(apiUrl('/api/health'), { cache: 'no-store', signal: controller.signal })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}
