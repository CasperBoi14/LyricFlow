import type { FastifyPluginAsync } from 'fastify'
import { exchangeSpotifyToken, getSpotifyPublicConfig } from '../services/spotify.service.js'

type SpotifyTokenBody = Record<string, unknown>

export const spotifyRoutes: FastifyPluginAsync = async (app) => {
  app.get('/config', async (_request, reply) => reply.code(200).send(getSpotifyPublicConfig()))

  app.post<{ Body: SpotifyTokenBody }>(
    '/token',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: true,
        },
      },
    },
    async (request, reply) => {
      const result = await exchangeSpotifyToken(request.body)
      return reply.code(result.statusCode).send(result.body)
    },
  )
}
