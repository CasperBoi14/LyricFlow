const AUDD_KEY = 'lf-audd-token'

function envValue(name: 'VITE_AUDD_API_TOKEN'): string {
  const value = import.meta.env[name] as string | undefined
  return typeof value === 'string' ? value.trim() : ''
}

function stored(key: string): string {
  try {
    return localStorage.getItem(key)?.trim() || ''
  } catch {
    return ''
  }
}

function store(key: string, value: string) {
  try {
    if (value.trim()) localStorage.setItem(key, value.trim())
    else localStorage.removeItem(key)
  } catch { /* storage unavailable */ }
}

/** AudD token used for microphone recognition without a backend. */
export function getAuddToken(): string {
  return stored(AUDD_KEY) || envValue('VITE_AUDD_API_TOKEN')
}

export function setAuddToken(value: string) {
  store(AUDD_KEY, value)
}
