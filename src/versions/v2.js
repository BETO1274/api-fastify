import articuloV2Routes from './v2/articulo.routes.js'
import stockV2Routes from './v2/stock.routes.js'
import recetaV2Routes from './v2/receta.routes.js'
import fabricacionV2Routes from './v2/fabricacion.routes.js'

export default async function v2Routes(fastify) {
  // Punto de entrada de la versión 2 de la API. Cada entidad integra en
  // tiempo real el top 1 de Deportista (deportBack) y de Sku (Inventario-U).
  fastify.register(articuloV2Routes, { prefix: '/articulos' })
  fastify.register(stockV2Routes, { prefix: '/stock' })
  fastify.register(recetaV2Routes, { prefix: '/recetas' })
  fastify.register(fabricacionV2Routes, { prefix: '/fabricaciones' })
}
