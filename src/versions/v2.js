import articuloV2Routes from './v2/articulo.routes.js'

export default async function v2Routes(fastify) {
  // Punto de entrada de la versión 2 de la API. Cada entidad que integre
  // datos en tiempo real de las APIs de los compañeros del equipo se
  // registrará aquí como su propio módulo.
  fastify.register(articuloV2Routes, { prefix: '/articulos' })
}
