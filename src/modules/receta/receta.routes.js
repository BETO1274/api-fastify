import { Type } from '@sinclair/typebox'
import { RecetaParams, RecetaBody, RecetaBodyParcial, RecetaQueryBody, RecetaResponse } from './receta.schema.js'
import { crearReceta, obtenerRecetaPorId, actualizarReceta, eliminarReceta, buscarRecetas } from './receta.controller.js'

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

  fastify.patch('/:id', {
    schema: { params: RecetaParams, body: RecetaBodyParcial, response: { 200: RecetaResponse } }
  }, async (request, reply) => {
    const receta = await actualizarReceta(request.params.id, request.body)
    if (!receta) {
      return reply.code(404).send({ mensaje: 'Receta no encontrada' })
    }
    return receta
  })

  fastify.delete('/:id', {
    schema: { params: RecetaParams }
  }, async (request, reply) => {
    const eliminado = await eliminarReceta(request.params.id)
    if (!eliminado) {
      return reply.code(404).send({ mensaje: 'Receta no encontrada' })
    }
    return reply.code(204).send()
  })

  fastify.query('/search', {
    schema: { body: RecetaQueryBody, response: { 200: Type.Array(RecetaResponse) } }
  }, async (request) => {
    return buscarRecetas(request.body)
  })
}
