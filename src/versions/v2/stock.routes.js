import { obtenerStockPorId, buscarStock } from '../../modules/stock/stock.controller.js'
import { registrarRutasV2 } from './entidad-v2.helper.js'

export default async function stockV2Routes(fastify) {
  registrarRutasV2({
    fastify,
    clave: 'stock',
    obtenerPorId: obtenerStockPorId,
    buscarTodos: () => buscarStock({}),
    mensajeNoEncontrado: 'Stock no encontrado',
    mensajeVacio: 'Aún no hay stock registrado'
  })
}
