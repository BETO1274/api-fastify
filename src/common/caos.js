// Inyeccion controlada de fallos para simular una regresion en el canary.
// Solo se registra cuando APP_TRACK=canary: la version estable no tiene ni
// el codigo activo ni los endpoints. Todo exige x-api-key = TEAM_API_KEY.
//
//   POST   /admin/caos  { "latencia_ms": 800, "tasa_error": 0.3 }
//   GET    /admin/caos  estado actual
//   DELETE /admin/caos  apaga el caos
//   Header por peticion: x-chaos: latency=800,error=0.3
const estado = {
  latenciaMs: Number(process.env.CAOS_LATENCIA_MS || 0),
  tasaError: Number(process.env.CAOS_TASA_ERROR || 0)
}

const RUTAS_EXENTAS = ['/health', '/metrics']

function autorizado(request) {
  const clave = process.env.TEAM_API_KEY
  return Boolean(clave) && request.headers['x-api-key'] === clave
}

function leerHeader(valor) {
  const resultado = {}
  for (const par of String(valor).split(',')) {
    const [nombre, dato] = par.split('=').map((parte) => parte.trim())
    if (nombre === 'latency') resultado.latenciaMs = Number(dato)
    if (nombre === 'error') resultado.tasaError = Number(dato)
  }
  return resultado
}

export function registrarCaos(app) {
  if (process.env.APP_TRACK !== 'canary') return

  app.addHook('onRequest', async (request, reply) => {
    const ruta = request.url.split('?')[0]
    if (RUTAS_EXENTAS.includes(ruta) || ruta.startsWith('/admin/')) return

    let { latenciaMs, tasaError } = estado
    if (request.headers['x-chaos'] && autorizado(request)) {
      ({ latenciaMs = latenciaMs, tasaError = tasaError } = leerHeader(request.headers['x-chaos']))
    }

    if (latenciaMs > 0) {
      await new Promise((resolver) => setTimeout(resolver, latenciaMs))
    }
    if (tasaError > 0 && Math.random() < tasaError) {
      return reply.code(500).send({ mensaje: 'Fallo inyectado (caos)' })
    }
  })

  app.addHook('preHandler', async (request, reply) => {
    if (!request.url.startsWith('/admin/caos')) return
    if (!autorizado(request)) {
      return reply.code(401).send({ mensaje: 'x-api-key inválida o ausente' })
    }
  })

  app.get('/admin/caos', { schema: { hide: true } }, async () => ({
    latencia_ms: estado.latenciaMs,
    tasa_error: estado.tasaError
  }))

  app.post('/admin/caos', { schema: { hide: true } }, async (request, reply) => {
    const { latencia_ms: latencia = 0, tasa_error: tasa = 0 } = request.body ?? {}
    if (!(latencia >= 0 && latencia <= 10000) || !(tasa >= 0 && tasa <= 1)) {
      return reply.code(400).send({ mensaje: 'latencia_ms debe estar entre 0 y 10000 y tasa_error entre 0 y 1' })
    }
    estado.latenciaMs = latencia
    estado.tasaError = tasa
    return { latencia_ms: estado.latenciaMs, tasa_error: estado.tasaError }
  })

  app.delete('/admin/caos', { schema: { hide: true } }, async () => {
    estado.latenciaMs = 0
    estado.tasaError = 0
    return { latencia_ms: 0, tasa_error: 0 }
  })
}
