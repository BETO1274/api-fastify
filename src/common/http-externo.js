const TIMEOUT_POR_DEFECTO_MS = 5000

// Llama a una API externa del equipo (deportBack, Inventario-U) con timeout
// y sin propagar el error: si la API externa falla o no responde a tiempo,
// se retorna { ok: false, error } para que el endpoint local pueda seguir
// respondiendo con degradación elegante en vez de romperse por completo.
export async function fetchConTimeout(url, { traceId, timeoutMs = TIMEOUT_POR_DEFECTO_MS } = {}) {
  const controlador = new AbortController()
  const temporizador = setTimeout(() => controlador.abort(), timeoutMs)

  try {
    const headers = {}
    if (traceId) headers['x-trace-id'] = traceId
    // Se envía a las otras 2 APIs del equipo para que puedan validar que la
    // llamada viene de una de las APIs autorizadas (ver src/versions/v2.js).
    if (process.env.TEAM_API_KEY) headers['x-api-key'] = process.env.TEAM_API_KEY

    const respuesta = await fetch(url, {
      signal: controlador.signal,
      headers
    })

    if (!respuesta.ok) {
      return { ok: false, error: `respuesta ${respuesta.status} de ${url}` }
    }

    const datos = await respuesta.json()
    return { ok: true, data: datos }
  } catch (error) {
    const mensaje = error.name === 'AbortError' ? `tiempo de espera agotado (${timeoutMs}ms) para ${url}` : error.message
    return { ok: false, error: mensaje }
  } finally {
    clearTimeout(temporizador)
  }
}
