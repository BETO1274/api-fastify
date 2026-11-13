import client from 'prom-client'

// Metricas Prometheus etiquetadas por version y track (stable | canary).
// Cubren las senales doradas: trafico y errores (http_requests_total),
// latencia (http_request_duration_seconds -> p50/p95/p99) y saturacion
// (CPU/memoria via collectDefaultMetrics), mas una metrica de negocio.
export const registro = new client.Registry()

registro.setDefaultLabels({
  version: process.env.APP_VERSION || 'dev',
  track: process.env.APP_TRACK || 'stable'
})

client.collectDefaultMetrics({ register: registro })

const peticiones = new client.Counter({
  name: 'http_requests_total',
  help: 'Peticiones HTTP atendidas',
  labelNames: ['method', 'route', 'status_class'],
  registers: [registro]
})

const duracion = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Latencia de las peticiones HTTP',
  labelNames: ['method', 'route'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registro]
})

export const articulosCreados = new client.Counter({
  name: 'articulos_creados_total',
  help: 'Metrica de negocio: articulos creados',
  registers: [registro]
})

export const fabricacionesRegistradas = new client.Counter({
  name: 'fabricaciones_registradas_total',
  help: 'Metrica de negocio: fabricaciones registradas',
  registers: [registro]
})

// ---- Llamadas salientes a las otras APIs del equipo (deportBack, Inventario-U) ----
// resultado: ok o el tipo de error (timeout, conexion, http_5xx, http_4xx,
// respuesta_invalida, circuito_abierto, sin_configurar).
export const dependenciaLlamadasTotal = new client.Counter({
  name: 'dependencia_llamadas_total',
  help: 'Llamadas a cada API externa, por resultado',
  labelNames: ['servicio', 'resultado'],
  registers: [registro]
})

export const dependenciaDuracionSegundos = new client.Histogram({
  name: 'dependencia_duracion_segundos',
  help: 'Duracion de las llamadas a cada API externa',
  labelNames: ['servicio'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registro]
})

// 0 = cerrado, 1 = semiabierto, 2 = abierto
export const circuitBreakerEstado = new client.Gauge({
  name: 'circuit_breaker_estado',
  help: 'Estado del circuit breaker por dependencia (0 cerrado, 1 semiabierto, 2 abierto)',
  labelNames: ['servicio'],
  registers: [registro]
})

export const circuitBreakerRechazosTotal = new client.Counter({
  name: 'circuit_breaker_rechazos_total',
  help: 'Llamadas rechazadas sin llegar a la dependencia porque su circuito estaba abierto',
  labelNames: ['servicio'],
  registers: [registro]
})

export function instrumentar(app) {
  app.addHook('onRequest', async (request) => {
    request.inicioMetrica = process.hrtime.bigint()
  })

  app.addHook('onResponse', async (request, reply) => {
    const route = request.routeOptions?.url ?? 'no_encontrada'
    if (route === '/metrics' || route === '/health') return
    const segundos = Number(process.hrtime.bigint() - request.inicioMetrica) / 1e9
    peticiones.inc({
      method: request.method,
      route,
      status_class: `${Math.floor(reply.statusCode / 100)}xx`
    })
    duracion.observe({ method: request.method, route }, segundos)
  })

  app.get('/metrics', { schema: { hide: true } }, async (request, reply) => {
    reply.header('Content-Type', registro.contentType)
    return registro.metrics()
  })
}
