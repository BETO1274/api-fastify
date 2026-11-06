// Registro de errores del router hacia Grafana Loki.
//
// El router ve todas las peticiones y sabe que servicio y que version respondio
// (cabeceras X-Track y X-App-Version), asi que es el lugar donde se puede dejar
// un log por error con el identificador de la API, sin tocar stable ni canary.
//
// Etiquetas de Loki (pocas y estables): app, level, track, version.
// Cada linea es un JSON con el detalle: status, method, path, request_id, error...
//
// Si falta LOKI_URL, LOKI_USER o LOKI_TOKEN el registro queda desactivado y no hace nada.
export function crearLogs({
  url,
  user,
  token,
  app = 'canary-router',
  intervaloMs = 2000,
  maxLote = 100,
  maxPendientes = 1000,
  fetchFn = fetch
} = {}) {
  const activo = Boolean(url && user && token)
  const autorizacion = activo ? `Basic ${Buffer.from(`${user}:${token}`).toString('base64')}` : ''
  let cola = []
  let temporizador = null
  const contadores = { enviados: 0, fallidos: 0, descartados: 0 }

  async function enviar(lote) {
    const flujos = new Map()
    for (const entrada of lote) {
      const clave = `${entrada.level}|${entrada.track}|${entrada.version}`
      if (!flujos.has(clave)) {
        flujos.set(clave, {
          stream: { app, level: entrada.level, track: entrada.track, version: entrada.version },
          values: []
        })
      }
      flujos.get(clave).values.push([entrada.ts, entrada.linea])
    }

    try {
      const respuesta = await fetchFn(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: autorizacion },
        body: JSON.stringify({ streams: [...flujos.values()] }),
        signal: AbortSignal.timeout(5000)
      })
      if (respuesta.ok) contadores.enviados += lote.length
      else contadores.fallidos += lote.length
    } catch {
      // Un fallo de Loki nunca debe afectar al trafico del router.
      contadores.fallidos += lote.length
    }
  }

  async function vaciar() {
    if (temporizador) {
      clearTimeout(temporizador)
      temporizador = null
    }
    while (cola.length > 0) {
      await enviar(cola.splice(0, maxLote))
    }
  }

  function programar() {
    if (temporizador) return
    temporizador = setTimeout(() => {
      temporizador = null
      vaciar()
    }, intervaloMs)
    temporizador.unref?.()
  }

  return {
    activo,

    registrar(nivel, campos = {}) {
      if (!activo) return
      if (cola.length >= maxPendientes) {
        contadores.descartados++
        return
      }
      const { track = 'desconocido', version = 'desconocida', ...detalle } = campos
      cola.push({
        ts: `${BigInt(Date.now()) * 1000000n}`,
        level: nivel,
        track,
        version,
        linea: JSON.stringify({ level: nivel, track, version, ...detalle })
      })
      if (cola.length >= maxLote) vaciar()
      else programar()
    },

    vaciar,

    async cerrar() {
      await vaciar()
    },

    estadisticas() {
      return { ...contadores, pendientes: cola.length }
    }
  }
}
