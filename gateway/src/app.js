import http from 'node:http'
import Fastify from 'fastify'
import fastifyHttpQuery from '@thecodepace/fastify-http-query'
import proxyRoutes from './proxy.routes.js'

export function buildApp() {
  const app = Fastify({
    logger: true,
    // Azure Container Apps bloquea el verbo QUERY en su ingress antes de
    // que la petición llegue aquí. El cliente lo manda como POST con este
    // header; se restaura el método real antes de que Fastify enrute.
    serverFactory: (handler) => http.createServer((req, res) => {
      if (req.method === 'POST' && req.headers['x-http-method-override']?.toUpperCase() === 'QUERY') {
        req.method = 'QUERY'
      }
      handler(req, res)
    })
  })

  // Registra el verbo QUERY para poder reenviarlo igual que los demás.
  app.register(fastifyHttpQuery)

  app.get('/health', async () => ({ status: 'ok' }))

  app.register(proxyRoutes)

  return app
}
