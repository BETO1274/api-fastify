// Dispatcher genérico: reenvía la tarea encolada a la API real
// correspondiente. No hay casos fijos por verbo — cualquier combinación de
// servicio/metodo/ruta/body que llegue se reenvía tal cual.

const URL_POR_SERVICIO = {
  api_fastify: () => process.env.API_FASTIFY_URL,
  deportback: () => process.env.DEPORTBACK_URL,
  inventario_u: () => process.env.INVENTARIO_U_URL
}

export async function despachar({ servicio, metodo, ruta, body, traceId }) {
  const obtenerUrlBase = URL_POR_SERVICIO[servicio]
  if (!obtenerUrlBase) {
    throw new Error(`servicio desconocido: ${servicio}`)
  }

  const urlBase = obtenerUrlBase()
  if (!urlBase) {
    throw new Error(`no hay URL configurada para el servicio "${servicio}"`)
  }

  const headers = {}
  if (traceId) headers['X-Trace-Id'] = traceId
  if (process.env.TEAM_API_KEY) headers['X-Api-Key'] = process.env.TEAM_API_KEY

  const opciones = { method: metodo, headers }
  // Content-Type solo cuando de verdad hay body: mandarlo en una petición
  // vacía (GET/DELETE típicamente) hace que Fastify del otro lado la
  // rechace con 400 "el body no puede estar vacío si dice ser JSON".
  if (body !== undefined && metodo !== 'GET' && metodo !== 'DELETE') {
    headers['Content-Type'] = 'application/json'
    opciones.body = JSON.stringify(body)
  }

  const respuesta = await fetch(`${urlBase}${ruta}`, opciones)
  const contentType = respuesta.headers.get('content-type') || ''
  const datos = contentType.includes('application/json')
    ? await respuesta.json().catch(() => null)
    : await respuesta.text()

  if (!respuesta.ok) {
    const error = new Error(`respuesta ${respuesta.status} de ${servicio}${ruta}`)
    error.status = respuesta.status
    error.datos = datos
    throw error
  }

  return { status: respuesta.status, datos }
}
