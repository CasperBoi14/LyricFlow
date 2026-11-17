import type { FastifyPluginAsync } from 'fastify'
import { exchangeSpotifyToken } from '../services/spotify.service.js'

type SpotifyTokenBody = Record<string, unknown>

export const spotifyRoutes: FastifyPluginAsync = async (app) => {
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
