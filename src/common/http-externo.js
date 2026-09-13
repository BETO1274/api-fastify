const TIMEOUT_POR_DEFECTO_MS = 5000

// Llama a una API externa del equipo (deportBack, Inventario-U) con timeout
// y sin propagar el error: si la API externa falla o no responde a tiempo,
// se retorna { ok: false, error } para que el endpoint local pueda seguir
// respondiendo con degradación elegante en vez de romperse por completo.
export async function fetchConTimeout(url, { traceId, timeoutMs = TIMEOUT_POR_DEFECTO_MS } = {}) {
  const controlador = new AbortController()
  const temporizador = setTimeout(() => controlador.abort(), timeoutMs)

  try {
    const respuesta = await fetch(url, {
      signal: controlador.signal,
      headers: traceId ? { 'x-trace-id': traceId } : {}
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
