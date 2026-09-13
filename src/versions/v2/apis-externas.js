import { fetchConTimeout } from '../../common/http-externo.js'

// Consulta en paralelo el top 1 de Deportista (deportBack) y de Sku
// (Inventario-U). Si alguna API no está configurada o falla, se devuelve
// { error } en su lugar sin interrumpir la respuesta. Los ids de las 3 apis
// del equipo no se corresponden entre sí (uuid vs entero, bases distintas),
// así que nunca se busca por id en las apis externas: siempre se muestra su
// primer registro real.
export async function obtenerApisExternasTop(traceId) {
  const deportbackUrl = process.env.DEPORTBACK_URL
  const inventarioUUrl = process.env.INVENTARIO_U_URL

  const [deportback, inventarioU] = await Promise.all([
    deportbackUrl
      ? fetchConTimeout(`${deportbackUrl}/deportistas`, { traceId })
      : Promise.resolve({ ok: false, error: 'DEPORTBACK_URL no configurada' }),
    inventarioUUrl
      ? fetchConTimeout(`${inventarioUUrl}/skus`, { traceId })
      : Promise.resolve({ ok: false, error: 'INVENTARIO_U_URL no configurada' })
  ])

  return {
    deportback: topDe(deportback.ok ? deportback.data : { error: deportback.error }),
    inventario_u: topDe(inventarioU.ok ? inventarioU.data : { error: inventarioU.error })
  }
}

// Toma el primer elemento de una lista externa (o la deja igual si vino
// con { error }, ya que en ese caso no es un arreglo).
function topDe(listaOError) {
  return Array.isArray(listaOError) && listaOError.length > 0 ? listaOError[0] : listaOError
}
