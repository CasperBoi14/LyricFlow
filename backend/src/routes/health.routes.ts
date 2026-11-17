import type { FastifyPluginAsync } from 'fastify'

const startedAt = Date.now()
const version = process.env.npm_package_version ?? '1.0.0'

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => ({
    status: 'ok',
    ok: true,
    service: 'lyricflow',
    version,
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    time: new Date().toISOString(),
  }))
}
