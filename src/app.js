import Fastify from 'fastify'
import fastifyHttpQuery from '@thecodepace/fastify-http-query'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import articuloRoutes from './modules/articulo/articulo.routes.js'
import stockRoutes from './modules/stock/stock.routes.js'
import recetaRoutes from './modules/receta/receta.routes.js'

export function buildApp() {
  const app = Fastify({
    logger: true
  })

  app.register(fastifyHttpQuery)

  app.register(swagger, {
    openapi: {
      info: {
        title: 'API Producción y Materiales',
        version: '1.0.0'
      }
    }
  })
  app.register(swaggerUi, {
    routePrefix: '/docs'
  })

  app.register(articuloRoutes, { prefix: '/articulos' })
  app.register(stockRoutes, { prefix: '/stock' })
  app.register(recetaRoutes, { prefix: '/recetas' })

  return app
}
