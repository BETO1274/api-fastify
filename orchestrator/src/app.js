import Fastify from 'fastify'
import orquestarRoutes from './orquestar.routes.js'

export function buildApp() {
  const app = Fastify({
    logger: true
  })

  app.get('/health', async () => ({ status: 'ok' }))

  app.register(orquestarRoutes)

  return app
}
