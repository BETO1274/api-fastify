import { StockParams, StockBody, StockBodyParcial, StockResponse } from './stock.schema.js'
import { crearStock, obtenerStockPorId, actualizarStock, eliminarStock } from './stock.controller.js'

export default async function stockRoutes(fastify) {
  fastify.post('/', {
    schema: { body: StockBody, response: { 201: StockResponse } }
  }, async (request, reply) => {
    const stock = await crearStock(request.body)
    reply.code(201)
    return stock
  })

  fastify.get('/:id', {
    schema: { params: StockParams, response: { 200: StockResponse } }
  }, async (request, reply) => {
    const stock = await obtenerStockPorId(request.params.id)
    if (!stock) {
      return reply.code(404).send({ mensaje: 'Stock no encontrado' })
    }
    return stock
  })

  fastify.patch('/:id', {
    schema: { params: StockParams, body: StockBodyParcial, response: { 200: StockResponse } }
  }, async (request, reply) => {
    const stock = await actualizarStock(request.params.id, request.body)
    if (!stock) {
      return reply.code(404).send({ mensaje: 'Stock no encontrado' })
    }
    return stock
  })

  fastify.delete('/:id', {
    schema: { params: StockParams }
  }, async (request, reply) => {
    const eliminado = await eliminarStock(request.params.id)
    if (!eliminado) {
      return reply.code(404).send({ mensaje: 'Stock no encontrado' })
    }
    return reply.code(204).send()
  })
}
