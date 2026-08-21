import { Type } from '@sinclair/typebox'
import {
  ArticuloParams,
  ArticuloBody,
  ArticuloBodyParcial,
  ArticuloQueryBody,
  ArticuloResponse
} from './articulo.schema.js'
import {
  crearArticulo,
  obtenerArticuloPorId,
  actualizarArticulo,
  eliminarArticulo,
  buscarArticulos
} from './articulo.controller.js'

export default async function articuloRoutes(fastify) {
  fastify.post('/', {
    schema: { body: ArticuloBody, response: { 201: ArticuloResponse } }
  }, async (request, reply) => {
    const articulo = await crearArticulo(request.body)
    reply.code(201)
    return articulo
  })

  fastify.get('/', {
    schema: { response: { 200: Type.Array(ArticuloResponse) } }
  }, async () => {
    return buscarArticulos({})
  })

  fastify.get('/:id', {
    schema: { params: ArticuloParams, response: { 200: ArticuloResponse } }
  }, async (request, reply) => {
    const articulo = await obtenerArticuloPorId(request.params.id)
    if (!articulo) {
      return reply.code(404).send({ mensaje: 'Artículo no encontrado' })
    }
    return articulo
  })

  fastify.patch('/:id', {
    schema: { params: ArticuloParams, body: ArticuloBodyParcial, response: { 200: ArticuloResponse } }
  }, async (request, reply) => {
    const articulo = await actualizarArticulo(request.params.id, request.body)
    if (!articulo) {
      return reply.code(404).send({ mensaje: 'Artículo no encontrado' })
    }
    return articulo
  })

  fastify.delete('/:id', {
    schema: { params: ArticuloParams }
  }, async (request, reply) => {
    const eliminado = await eliminarArticulo(request.params.id)
    if (!eliminado) {
      return reply.code(404).send({ mensaje: 'Artículo no encontrado' })
    }
    return reply.code(204).send()
  })

  fastify.query('/search', {
    schema: { body: ArticuloQueryBody, response: { 200: Type.Array(ArticuloResponse) } }
  }, async (request) => {
    return buscarArticulos(request.body)
  })
}
