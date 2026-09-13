import { obtenerArticuloPorId, buscarArticulos } from '../../modules/articulo/articulo.controller.js'
import { fetchConTimeout } from '../../common/http-externo.js'

// Consulta en paralelo las listas completas de Deportista (deportBack) y
// Sku (Inventario-U). Si alguna API no está configurada o falla, se
// devuelve { error } en su lugar sin interrumpir la respuesta.
async function obtenerApisExternas(traceId) {
  const deportbackUrl = process.env.DEPORTBACK_URL
  const inventarioUUrl = process.env.INVENTARIO_U_URL

  const [deportback, inventarioU] = await Promise.all([
    deportbackUrl
      ? fetchConTimeout(`${deportbackUrl}/deportistas`, { traceId })
      : Promise.resolve({ ok: false, error: 'DEPORTBACK_URL no configurada' }),
    inventarioUUrl
      ? fetchConTimeout(`${inventarioUUrl}/skus`, { traceId })
      : Promise.resolve({ ok: false, error: 'INVENTARIO_U_URL no configurada' })
  ])

  return {
    deportback: deportback.ok ? deportback.data : { error: deportback.error },
    inventario_u: inventarioU.ok ? inventarioU.data : { error: inventarioU.error }
  }
}

// Toma el primer elemento de una lista externa (o null si vino vacía o con error).
function topDe(listaOError) {
  return Array.isArray(listaOError) && listaOError.length > 0 ? listaOError[0] : null
}

export default async function articuloV2Routes(fastify) {
  // Registrada antes de "/:id" para que "top" no se interprete como un id.
  fastify.get('/top', async (request, reply) => {
    const traceId = request.headers['x-trace-id'] ?? crypto.randomUUID()
    reply.header('x-trace-id', traceId)

    const [articulos, apisExternas] = await Promise.all([
      buscarArticulos({}),
      obtenerApisExternas(traceId)
    ])

    const articulo = articulos[0]
    if (!articulo) {
      return reply.code(404).send({ mensaje: 'Aún no hay artículos registrados' })
    }

    return {
      articulo,
      apis_externas: {
        deportback: topDe(apisExternas.deportback) ?? apisExternas.deportback,
        inventario_u: topDe(apisExternas.inventario_u) ?? apisExternas.inventario_u
      }
    }
  })

  fastify.get('/:id', async (request, reply) => {
    const traceId = request.headers['x-trace-id'] ?? crypto.randomUUID()
    reply.header('x-trace-id', traceId)

    const [articulo, apisExternas] = await Promise.all([
      obtenerArticuloPorId(request.params.id),
      obtenerApisExternas(traceId)
    ])

    if (!articulo) {
      return reply.code(404).send({ mensaje: 'Artículo no encontrado' })
    }

    return { articulo, apis_externas: apisExternas }
  })
}
