import { obtenerRecetaPorId, buscarRecetas } from '../../modules/receta/receta.controller.js'
import { registrarRutasV2 } from './entidad-v2.helper.js'

export default async function recetaV2Routes(fastify) {
  registrarRutasV2({
    fastify,
    clave: 'receta',
    obtenerPorId: obtenerRecetaPorId,
    buscarTodos: () => buscarRecetas({}),
    mensajeNoEncontrado: 'Receta no encontrada',
    mensajeVacio: 'Aún no hay recetas registradas'
  })
}
