import { RecetaParams, RecetaBody, RecetaResponse } from './receta.schema.js'
import { crearReceta, obtenerRecetaPorId } from './receta.controller.js'

export default async function recetaRoutes(fastify) {
  fastify.post('/', {
    schema: { body: RecetaBody, response: { 201: RecetaResponse } }
  }, async (request, reply) => {
    const receta = await crearReceta(request.body)
    reply.code(201)
    return receta
  })

  fastify.get('/:id', {
    schema: { params: RecetaParams, response: { 200: RecetaResponse } }
  }, async (request, reply) => {
    const receta = await obtenerRecetaPorId(request.params.id)
    if (!receta) {
      return reply.code(404).send({ mensaje: 'Receta no encontrada' })
    }
    return receta
  })
}
