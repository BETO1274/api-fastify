// Cliente para el Object Storage de Inventario-U (componente transversal
// "Storage + Analítica", a su cargo). Contrato real, validado en vivo:
//   POST /api/v2/storage        body { trace_id, data } -> 201 { object_name, bucket, status }
//   GET  /api/v2/storage/:id    -> 200 <data>            | 404 si no existe
//
// A diferencia de la Cache (solo GET), el Storage guarda SIEMPRE: es el
// registro histórico del flujo completo, sin importar el método. Igual que
// la Cache, es una optimización/auditoría — nunca debe tumbar el flujo real.
const TIMEOUT_MS = 5000

function headersComunes(traceId) {
  const headers = {}
  if (traceId) headers['X-Trace-Id'] = traceId
  if (process.env.TEAM_API_KEY) headers['X-Api-Key'] = process.env.TEAM_API_KEY
  return headers
}

export async function guardarEnStorage(traceId, data) {
  const urlBase = process.env.STORAGE_URL
  if (!urlBase || !traceId) return

  const controlador = new AbortController()
  const temporizador = setTimeout(() => controlador.abort(), TIMEOUT_MS)

  try {
    await fetch(`${urlBase}/api/v2/storage`, {
      method: 'POST',
      headers: { ...headersComunes(traceId), 'Content-Type': 'application/json' },
      body: JSON.stringify({ trace_id: traceId, data }),
      signal: controlador.signal
    })
  } catch {
    // no se propaga: guardar en storage nunca debe hacer fallar la tarea real
  } finally {
    clearTimeout(temporizador)
  }
}

export async function obtenerDeStorage(traceId) {
  const urlBase = process.env.STORAGE_URL
  if (!urlBase || !traceId) return undefined

  const controlador = new AbortController()
  const temporizador = setTimeout(() => controlador.abort(), TIMEOUT_MS)

  try {
    const respuesta = await fetch(`${urlBase}/api/v2/storage/${encodeURIComponent(traceId)}`, {
      headers: headersComunes(traceId),
      signal: controlador.signal
    })

    if (!respuesta.ok) return undefined
    return await respuesta.json()
  } catch {
    return undefined
  } finally {
    clearTimeout(temporizador)
  }
}
