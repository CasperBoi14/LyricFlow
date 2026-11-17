import type { FastifyPluginAsync } from 'fastify'
import { identifySong } from '../services/identify.service.js'

type IdentifyBody = {
  sample: string
}

export const identifyRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: IdentifyBody }>(
    '/identify',
    {
      schema: {
        body: {
          type: 'object',
          required: ['sample'],
          additionalProperties: false,
          properties: {
            sample: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (request) => identifySong(request.body.sample),
  )
}
