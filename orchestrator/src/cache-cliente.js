// Cliente para la Cache distribuida de deportBack (componente transversal
// "Cache + Gateway", a su cargo). Contrato real, confirmado contra su repo
// (redundante3452/deportBack, src/cache/cache.controller.ts):
//   GET  /cache/:key  -> 200 { key, value } | 404 si no existe o expiró
//   POST /cache        -> body { key, value, ttl? } -> 201 { key, ttl }
//
// La cache es una optimización: si CACHE_URL no está configurada, o la
// llamada falla por cualquier motivo (deportBack caído, timeout, etc.), el
// orquestador debe seguir funcionando igual — nunca se deja que un fallo de
// cache tumbe el flujo real de la tarea.
const TTL_SEGUNDOS_DEFAULT = 60
const TIMEOUT_MS = 3000

function headersComunes(traceId) {
  const headers = {}
  if (traceId) headers['X-Trace-Id'] = traceId
  if (process.env.TEAM_API_KEY) headers['X-Api-Key'] = process.env.TEAM_API_KEY
  return headers
}

// La key de cache identifica de forma única una petición de solo lectura:
// mismo servicio + método + ruta -> mismo dato.
export function claveDeCache({ servicio, metodo, ruta }) {
  return `${servicio}:${metodo}:${ruta}`
}

export async function obtenerDeCache(key, traceId) {
  const urlBase = process.env.CACHE_URL
  if (!urlBase) return undefined

  const controlador = new AbortController()
  const temporizador = setTimeout(() => controlador.abort(), TIMEOUT_MS)

  try {
    const respuesta = await fetch(`${urlBase}/cache/${encodeURIComponent(key)}`, {
      headers: headersComunes(traceId),
      signal: controlador.signal
    })

    if (!respuesta.ok) return undefined // incluye 404: no hay entrada

    const cuerpo = await respuesta.json()
    return cuerpo.value
  } catch {
    return undefined
  } finally {
    clearTimeout(temporizador)
  }
}

export async function guardarEnCache(key, value, traceId, ttl = TTL_SEGUNDOS_DEFAULT) {
  const urlBase = process.env.CACHE_URL
  if (!urlBase) return

  const controlador = new AbortController()
  const temporizador = setTimeout(() => controlador.abort(), TIMEOUT_MS)

  try {
    await fetch(`${urlBase}/cache`, {
      method: 'POST',
      headers: { ...headersComunes(traceId), 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value, ttl }),
      signal: controlador.signal
    })
  } catch {
    // no se propaga: guardar en cache nunca debe hacer fallar la tarea real
  } finally {
    clearTimeout(temporizador)
  }
}
