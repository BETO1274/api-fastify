import articuloV2Routes from './v2/articulo.routes.js'
import stockV2Routes from './v2/stock.routes.js'
import recetaV2Routes from './v2/receta.routes.js'
import fabricacionV2Routes from './v2/fabricacion.routes.js'

export default async function v2Routes(fastify) {
  // Punto de entrada de la versión 2 de la API. Cada entidad integra en
  // tiempo real el top 1 de Deportista (deportBack) y de Sku (Inventario-U).

  // Control de acceso entre las 3 APIs del equipo: si TEAM_API_KEY está
  // configurada, se exige el header x-api-key en cada petición a /api/v2/*.
  // Si no está configurada, las rutas quedan abiertas (retrocompatible,
  // mientras se coordina la key con los compañeros).
  fastify.addHook('preHandler', async (request, reply) => {
    const teamApiKey = process.env.TEAM_API_KEY
    if (!teamApiKey) return

    if (request.headers['x-api-key'] !== teamApiKey) {
      return reply.code(401).send({ mensaje: 'x-api-key inválida o ausente' })
    }
  })

  fastify.register(articuloV2Routes, { prefix: '/articulos' })
  fastify.register(stockV2Routes, { prefix: '/stock' })
  fastify.register(recetaV2Routes, { prefix: '/recetas' })
  fastify.register(fabricacionV2Routes, { prefix: '/fabricaciones' })
}
