import { Type } from '@sinclair/typebox'
import { FabricacionParams, FabricacionBody, FabricacionBodyParcial, FabricacionQueryBody, FabricacionResponse } from './fabricacion.schema.js'
import { crearFabricacion, obtenerFabricacionPorId, actualizarFabricacion, eliminarFabricacion, buscarFabricaciones } from './fabricacion.controller.js'

export default async function fabricacionRoutes(fastify) {
  fastify.post('/', {
    schema: { body: FabricacionBody, response: { 201: FabricacionResponse } }
  }, async (request, reply) => {
    try {
      const fabricacion = await crearFabricacion(request.body)
      reply.code(201)
      return fabricacion
    } catch (error) {
      if (error.statusCode) {
        return reply.code(error.statusCode).send({ mensaje: error.message })
      }
      throw error
    }
  })

  fastify.get('/', {
    schema: { response: { 200: Type.Array(FabricacionResponse) } }
  }, async () => {
    return buscarFabricaciones({})
  })

  fastify.get('/:id', {
    schema: { params: FabricacionParams, response: { 200: FabricacionResponse } }
  }, async (request, reply) => {
    const fabricacion = await obtenerFabricacionPorId(request.params.id)
    if (!fabricacion) {
      return reply.code(404).send({ mensaje: 'Fabricación no encontrada' })
    }
    return fabricacion
  })

  fastify.patch('/:id', {
    schema: { params: FabricacionParams, body: FabricacionBodyParcial, response: { 200: FabricacionResponse } }
  }, async (request, reply) => {
    const fabricacion = await actualizarFabricacion(request.params.id, request.body)
    if (!fabricacion) {
      return reply.code(404).send({ mensaje: 'Fabricación no encontrada' })
    }
    return fabricacion
  })

  fastify.delete('/:id', {
    schema: { params: FabricacionParams }
  }, async (request, reply) => {
    const eliminado = await eliminarFabricacion(request.params.id)
    if (!eliminado) {
      return reply.code(404).send({ mensaje: 'Fabricación no encontrada' })
    }
    return reply.code(204).send()
  })

  fastify.query('/search', {
    schema: { body: FabricacionQueryBody, response: { 200: Type.Array(FabricacionResponse) } }
  }, async (request) => {
    return buscarFabricaciones(request.body)
  })
}
