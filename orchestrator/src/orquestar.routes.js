import { OrquestarBody, OrquestarParams, TareaResponse } from './orquestar.schema.js'
import { crearTarea, obtenerTarea, actualizarTarea } from './tareas.js'
import { encolarTarea } from './cola.js'
import { exigirApiKey } from './auth.js'

export default async function orquestarRoutes(fastify) {
  // Segunda capa de defensa: en producción, solo el gateway debe poder
  // llegar aquí (el Service queda como ClusterIP). Esto protege /orquestar
  // igual aunque esa configuración de red fallara.
  fastify.addHook('preHandler', exigirApiKey)

  fastify.post('/orquestar', {
    schema: { body: OrquestarBody, response: { 202: TareaResponse } }
  }, async (request, reply) => {
    // El gateway siempre manda X-Trace-Id (lo genera si el cliente no lo
    // trajo). Si algo llamara al orquestador sin pasar por el gateway, se
    // genera aquí como último recurso — pero nunca se reemplaza uno que ya
    // venía, porque rompería la correlación end-to-end entre las 3 nubes.
    const traceId = request.headers['x-trace-id'] ?? crypto.randomUUID()
    reply.header('x-trace-id', traceId)

    // Se persiste primero (para que GET /orquestar/:id funcione ya mismo),
    // y luego se manda a la cola real para que el worker la procese.
    const tarea = await crearTarea({ ...request.body, traceId })

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
    // El trace-id de la consulta es el de la tarea que ya se creó — así el
    // que pregunta "¿cómo va esto?" puede seguir buscando ese mismo id.
    if (tarea.traceId) reply.header('x-trace-id', tarea.traceId)
    return tarea
  })
}
