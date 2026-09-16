import { OrquestarBody, OrquestarParams, TareaResponse } from './orquestar.schema.js'
import { crearTarea, obtenerTarea } from './tareas-memoria.js'

export default async function orquestarRoutes(fastify) {
  fastify.post('/orquestar', {
    schema: { body: OrquestarBody, response: { 202: TareaResponse } }
  }, async (request, reply) => {
    // Por ahora solo encola en memoria (placeholder) — la conexión real a
    // Azure Service Bus se agrega en el siguiente paso del plan.
    const tarea = crearTarea(request.body)
    reply.code(202)
    return tarea
  })

  fastify.get('/orquestar/:id', {
    schema: { params: OrquestarParams, response: { 200: TareaResponse } }
  }, async (request, reply) => {
    const tarea = obtenerTarea(request.params.id)
    if (!tarea) {
      return reply.code(404).send({ mensaje: 'Tarea no encontrada' })
    }
    return tarea
  })
}
