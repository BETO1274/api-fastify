import { obtenerApisExternasTop } from './apis-externas.js'

// Registra "GET /top" y "GET /:id" para una entidad v2, ambos con el mismo
// envelope { <clave>, apis_externas }. "/top" no recibe id (toma el primer
// registro real de nuestra propia tabla); "/:id" recibe nuestro id real y
// responde exactamente ese registro. En ambos casos, de deportBack e
// Inventario-U se trae siempre su top 1, nunca por id.
export function registrarRutasV2({ fastify, clave, obtenerPorId, buscarTodos, mensajeNoEncontrado, mensajeVacio }) {
  // Registrada antes de "/:id" para que "top" no se interprete como un id.
  fastify.get('/top', async (request, reply) => {
    const traceId = request.headers['x-trace-id'] ?? crypto.randomUUID()
    reply.header('x-trace-id', traceId)

    const [registros, apisExternas] = await Promise.all([
      buscarTodos(),
      obtenerApisExternasTop(traceId)
    ])

    const registro = registros[0]
    if (!registro) {
      return reply.code(404).send({ mensaje: mensajeVacio })
    }

    return { [clave]: registro, apis_externas: apisExternas }
  })

  fastify.get('/:id', async (request, reply) => {
    const traceId = request.headers['x-trace-id'] ?? crypto.randomUUID()
    reply.header('x-trace-id', traceId)

    const [registro, apisExternas] = await Promise.all([
      obtenerPorId(request.params.id),
      obtenerApisExternasTop(traceId)
    ])

    if (!registro) {
      return reply.code(404).send({ mensaje: mensajeNoEncontrado })
    }

    return { [clave]: registro, apis_externas: apisExternas }
  })
}
