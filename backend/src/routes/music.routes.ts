import type { FastifyPluginAsync } from 'fastify'
import { BadRequestError } from '../lib/errors.js'
import { searchMusic } from '../services/music.service.js'

type SearchMusicQuery = {
  q?: string
}

export const musicRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: SearchMusicQuery }>(
    '/search',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            q: { type: 'string', maxLength: 300 },
          },
        },
      },
    },
    async (request) => {
      const query = (request.query.q ?? '').trim()
      if (!query) throw new BadRequestError('Missing query')
      return searchMusic(query)
    },
  )
}
