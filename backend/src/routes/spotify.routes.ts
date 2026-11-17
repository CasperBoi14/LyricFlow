import type { FastifyPluginAsync } from 'fastify'
import { exchangeSpotifyToken, getSpotifyAuthorizeUrl, getSpotifyPublicConfig } from '../services/spotify.service.js'

type SpotifyTokenBody = Record<string, unknown>
type SpotifyLoginQuery = { redirect_uri?: string; state?: string; challenge?: string }

export const spotifyRoutes: FastifyPluginAsync = async (app) => {
  app.get('/config', async (_request, reply) => reply.code(200).send(getSpotifyPublicConfig()))

  app.get<{ Querystring: SpotifyLoginQuery }>('/login', async (request, reply) => {
    const url = getSpotifyAuthorizeUrl({
      redirectUri: request.query.redirect_uri?.trim() || '',
      state: request.query.state?.trim() || '',
      codeChallenge: request.query.challenge?.trim() || '',
    })
    if (!url) return reply.code(503).send({ error: 'Spotify is not configured on the server' })
    return reply.code(200).send({ url })
  })

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
