import { RecetaBody, RecetaResponse } from './receta.schema.js'
import { crearReceta } from './receta.controller.js'

export default async function recetaRoutes(fastify) {
  fastify.post('/', {
    schema: { body: RecetaBody, response: { 201: RecetaResponse } }
  }, async (request, reply) => {
    const receta = await crearReceta(request.body)
    reply.code(201)
    return receta
  })
}
