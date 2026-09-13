import { obtenerFabricacionPorId, buscarFabricaciones } from '../../modules/fabricacion/fabricacion.controller.js'
import { registrarRutasV2 } from './entidad-v2.helper.js'

export default async function fabricacionV2Routes(fastify) {
  registrarRutasV2({
    fastify,
    clave: 'fabricacion',
    obtenerPorId: obtenerFabricacionPorId,
    buscarTodos: () => buscarFabricaciones({}),
    mensajeNoEncontrado: 'Fabricación no encontrada',
    mensajeVacio: 'Aún no hay fabricaciones registradas'
  })
}
