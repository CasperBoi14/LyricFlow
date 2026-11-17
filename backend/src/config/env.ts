import 'dotenv/config'

function readString(name: string, fallback: string): string {
  const value = process.env[name]
  return value === undefined || value.trim() === '' ? fallback : value.trim()
}

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === '') return fallback
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Environment variable ${name} must be a positive number`)
  }
  return value
}

function readBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === '') return fallback
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase())
}

function readNodeEnv(): 'development' | 'production' | 'test' {
  const value = readString('NODE_ENV', 'development')
  if (value === 'development' || value === 'production' || value === 'test') return value
  throw new Error('NODE_ENV must be one of: development, production, test')
}

const defaultCorsOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'https://casperboi14.github.io',
]

export const config = {
  nodeEnv: readNodeEnv(),
  host: readString('HOST', '0.0.0.0'),
  port: readNumber('PORT', 8787),
  logLevel: readString('LOG_LEVEL', 'info'),
  bodyLimit: readNumber('BODY_LIMIT', 25 * 1024 * 1024),
  trustProxy: readBoolean('TRUST_PROXY', false),
  spotifyClientId: readString('SPOTIFY_CLIENT_ID', ''),
  spotifyClientSecret: readString('SPOTIFY_CLIENT_SECRET', ''),
  corsOrigins: readString('CORS_ORIGIN', defaultCorsOrigins.join(','))
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
} as const

export type AppConfig = typeof config
