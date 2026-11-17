import type { FastifyPluginAsync } from 'fastify'
import { BadRequestError } from '../lib/errors.js'
import { findAudioSource } from '../services/audio.service.js'

type FindAudioQuery = {
  q?: string
}

export const audioRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: FindAudioQuery }>(
    '/find',
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
      return findAudioSource(query)
    },
  )
}
