import { obtenerArticuloPorId } from '../../modules/articulo/articulo.controller.js'
import { fetchConTimeout } from '../../common/http-externo.js'

export default async function articuloV2Routes(fastify) {
  fastify.get('/:id', async (request, reply) => {
    const traceId = request.headers['x-trace-id'] ?? crypto.randomUUID()
    reply.header('x-trace-id', traceId)

    const deportbackUrl = process.env.DEPORTBACK_URL
    const inventarioUUrl = process.env.INVENTARIO_U_URL

    const [articulo, deportback, inventarioU] = await Promise.all([
      obtenerArticuloPorId(request.params.id),
      deportbackUrl
        ? fetchConTimeout(`${deportbackUrl}/deportistas`, { traceId })
        : Promise.resolve({ ok: false, error: 'DEPORTBACK_URL no configurada' }),
      inventarioUUrl
        ? fetchConTimeout(`${inventarioUUrl}/skus`, { traceId })
        : Promise.resolve({ ok: false, error: 'INVENTARIO_U_URL no configurada' })
    ])

    if (!articulo) {
      return reply.code(404).send({ mensaje: 'Artículo no encontrado' })
    }

    return {
      articulo,
      apis_externas: {
        deportback: deportback.ok ? deportback.data : { error: deportback.error },
        inventario_u: inventarioU.ok ? inventarioU.data : { error: inventarioU.error }
      }
    }
  })
}
