import type { FastifyInstance } from 'fastify'
import { audioRoutes } from './audio.routes.js'
import { healthRoutes } from './health.routes.js'
import { identifyRoutes } from './identify.routes.js'
import { lyricsRoutes } from './lyrics.routes.js'
import { musicRoutes } from './music.routes.js'
import { spotifyRoutes } from './spotify.routes.js'

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(healthRoutes, { prefix: '/api' })
  await app.register(audioRoutes, { prefix: '/api/audio' })
  await app.register(musicRoutes, { prefix: '/api/music' })
  await app.register(lyricsRoutes, { prefix: '/api/lyrics' })
  await app.register(identifyRoutes, { prefix: '/api' })
  await app.register(spotifyRoutes, { prefix: '/api/spotify' })
}
