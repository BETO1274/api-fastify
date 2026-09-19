import { OrquestarBody, OrquestarParams, TareaResponse } from './orquestar.schema.js'
import { crearTarea, obtenerTarea, actualizarTarea } from './tareas.js'
import { encolarTarea } from './cola.js'

export default async function orquestarRoutes(fastify) {
  fastify.post('/orquestar', {
    schema: { body: OrquestarBody, response: { 202: TareaResponse } }
  }, async (request, reply) => {
    // Se persiste primero (para que GET /orquestar/:id funcione ya mismo),
    // y luego se manda a la cola real para que el worker la procese.
    const tarea = await crearTarea(request.body)

    if (process.env.SERVICEBUS_CONNECTION_STRING) {
      try {
        await encolarTarea(tarea)
      } catch (error) {
        const fallida = await actualizarTarea(tarea.id, {
          estado: 'fallido',
          resultado: { error: `no se pudo encolar: ${error.message}` }
        })
        reply.code(202)
        return fallida
      }
    } else {
      request.log.warn('SERVICEBUS_CONNECTION_STRING no configurada — la tarea queda registrada, sin encolar de verdad')
    }

    reply.code(202)
    return tarea
  })

  fastify.get('/orquestar/:id', {
    schema: { params: OrquestarParams, response: { 200: TareaResponse } }
  }, async (request, reply) => {
    const tarea = await obtenerTarea(request.params.id)
    if (!tarea) {
      return reply.code(404).send({ mensaje: 'Tarea no encontrada' })
    }
    return tarea
  })
}
