import cors from '@fastify/cors'
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify'
import { config } from './config/env.js'
import { HttpError } from './lib/errors.js'
import { registerRoutes } from './routes/index.js'

function isAllowedOrigin(origin: string): boolean {
  if (config.corsOrigins.includes('*') || config.corsOrigins.includes(origin)) return true

  try {
    const url = new URL(origin)
    return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
  } catch {
    return false
  }
}

function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send({
        error: error.code,
        message: error.message,
        statusCode: error.statusCode,
      })
    }

    if (error.validation) {
      return reply.code(400).send({
        error: 'Validation Error',
        message: error.message,
        statusCode: 400,
      })
    }

    const statusCode =
      typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode <= 599
        ? error.statusCode
        : 500

    if (statusCode >= 500) {
      request.log.error({ err: error }, 'Unhandled request error')
      return reply.code(statusCode).send({
        error: 'Internal Server Error',
        message: 'Unexpected server error.',
        statusCode,
      })
    }

    return reply.code(statusCode).send({
      error: error.name,
      message: error.message,
      statusCode,
    })
  })

  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send({
      error: 'Not Found',
      message: `Route ${request.method} ${request.url} not found`,
      statusCode: 404,
    }),
  )
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.nodeEnv === 'test' ? false : { level: config.logLevel },
    bodyLimit: config.bodyLimit,
    trustProxy: config.trustProxy,
  })

  await app.register(cors, {
    origin(origin, callback) {
      if (!origin || isAllowedOrigin(origin)) {
        callback(null, true)
        return
      }
      callback(null, false)
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86_400,
    credentials: false,
  })

  registerErrorHandling(app)
  await registerRoutes(app)

  return app
}
