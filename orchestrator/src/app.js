import Fastify from 'fastify'
import orquestarRoutes from './orquestar.routes.js'
import { registro } from './metricas.js'

export function buildApp() {
  const app = Fastify({
    logger: true
  })

  app.get('/health', async () => ({ status: 'ok' }))

  // Sin auth: es lo que Alloy scrapea. No expone datos de negocio, solo
  // contadores/histogramas de las llamadas al Storage de Inventario-U.
  app.get('/metrics', async (request, reply) => {
    reply.header('Content-Type', registro.contentType)
    return registro.metrics()
  })

  app.register(orquestarRoutes)

  return app
}
