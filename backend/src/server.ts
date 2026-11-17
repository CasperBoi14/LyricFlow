import { buildApp } from './app.js'
import { config } from './config/env.js'

const app = await buildApp()
let closing = false

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (closing) return
  closing = true

  app.log.info({ signal }, 'Shutting down')
  try {
    await app.close()
  } catch (error) {
    app.log.error({ err: error }, 'Graceful shutdown failed')
    process.exitCode = 1
  }
}

process.once('SIGINT', () => void shutdown('SIGINT'))
process.once('SIGTERM', () => void shutdown('SIGTERM'))

try {
  await app.listen({ port: config.port, host: config.host })
} catch (error) {
  app.log.error({ err: error }, 'Failed to start server')
  process.exit(1)
}
