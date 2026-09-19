import Fastify from 'fastify'
import fastifyHttpQuery from '@thecodepace/fastify-http-query'
import proxyRoutes from './proxy.routes.js'

export function buildApp() {
  const app = Fastify({
    logger: true
  })

  // Registra el verbo QUERY para poder reenviarlo igual que los demás.
  app.register(fastifyHttpQuery)

  app.get('/health', async () => ({ status: 'ok' }))

  app.register(proxyRoutes)

  return app
}
