import { obtenerArticuloPorId, buscarArticulos } from '../../modules/articulo/articulo.controller.js'
import { registrarRutasV2 } from './entidad-v2.helper.js'

export default async function articuloV2Routes(fastify) {
  registrarRutasV2({
    fastify,
    clave: 'articulo',
    obtenerPorId: obtenerArticuloPorId,
    buscarTodos: () => buscarArticulos({}),
    mensajeNoEncontrado: 'Artículo no encontrado',
    mensajeVacio: 'Aún no hay artículos registrados'
  })
}
