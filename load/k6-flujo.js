// Generador de carga del flujo GET /api/v2/articulos/:id de api-fastify (el
// coordinador): en una sola petición conecta las tres nubes (api-fastify en
// Azure, deportBack e Inventario-U), propagando el mismo X-Trace-Id.
//
// PERFIL DE CARGA "P" — fijo y declarado. La Ronda 0 y la Ronda 1 usan
// exactamente este mismo perfil; no se acepta comparar dos mediciones con
// cargas distintas. Si se cambia algo aquí, hay que repetir las dos rondas.
//
//   escalón        tasa      duración   para qué
//   calentamiento  2 req/s   30 s       estabilizar conexiones y réplicas
//   base           5 req/s   60 s       estado estable antes del fallo
//   carga          10 req/s  120 s      aquí cae la ventana de inyección
//   recuperación   2 req/s   60 s       observar la vuelta al estado estable
//   total: 270 s (4 min 30 s)
//
// Es un modelo de TASA FIJA (ramping-arrival-rate), no de usuarios fijos: la
// tasa de llegada no baja cuando el sistema se vuelve lento. Con usuarios
// fijos, una API lenta reduciría sola la carga y ocultaría el problema.
//
// Uso (ver load/README.md):
//   k6 run -e BASE_URL=http://<api-fastify> -e API_KEY=<clave> \
//          -e EJECUCION_ID=r0-001 -e RONDA=0 -e EXPERIMENTO=latencia-saliente load/k6-flujo.js
import http from 'k6/http'
import exec from 'k6/execution'
import { check } from 'k6'
import { Rate } from 'k6/metrics'

const BASE_URL = __ENV.BASE_URL
const API_KEY = __ENV.API_KEY
const EJECUCION_ID = __ENV.EJECUCION_ID || `local-${Date.now()}`
const RONDA = __ENV.RONDA || 'sin-ronda'
const EXPERIMENTO = __ENV.EXPERIMENTO || 'sin-experimento'
const RESULTADOS_DIR = __ENV.RESULTADOS_DIR || 'resultados'

if (!BASE_URL) {
  throw new Error('Falta BASE_URL (la dirección pública de api-fastify). Ejemplo: -e BASE_URL=http://1.2.3.4')
}

const ESCALONES = [
  { duration: '30s', target: 2 },
  { duration: '60s', target: 5 },
  { duration: '120s', target: 10 },
  { duration: '60s', target: 2 }
]

// Los umbrales NO traen valores por defecto: no se inventan. Se aplican solo
// si se pasan, y deben salir de la medición del estado estable y de la
// hipótesis del experimento (chaos/experiments/*.experimento.yaml).
const umbrales = {}
if (__ENV.MAX_P95_MS) umbrales['http_req_duration{endpoint:flujo}'] = [`p(95)<${__ENV.MAX_P95_MS}`]
if (__ENV.MAX_ERROR_RATE) umbrales.http_req_failed = [`rate<${__ENV.MAX_ERROR_RATE}`]
if (__ENV.MIN_FLUJO_EXITO) umbrales.flujo_exito = [`rate>${__ENV.MIN_FLUJO_EXITO}`]

export const options = {
  scenarios: {
    flujo: {
      executor: 'ramping-arrival-rate',
      startRate: 2,
      timeUnit: '1s',
      // Con latencia inyectada de varios segundos hacen falta muchos VUs en
      // vuelo para sostener la tasa; si se agotan, k6 lo reporta como
      // dropped_iterations (dato a vigilar, no a ocultar).
      preAllocatedVUs: 30,
      maxVUs: 150,
      stages: ESCALONES
    }
  },
  thresholds: umbrales,
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  tags: { execution_id: EJECUCION_ID, ronda: RONDA, experimento: EXPERIMENTO }
}

// Éxito real del flujo: HTTP 200 Y las dos APIs externas respondieron (ninguna
// trae `error` en apis_externas). Una respuesta degradada (200 con error en una
// de ellas) NO cuenta como éxito: una respuesta de error más rápida no
// demuestra por sí sola una mejora.
const flujoExito = new Rate('flujo_exito')
const flujoDegradado = new Rate('flujo_degradado')
const tracePropagado = new Rate('trace_id_devuelto')

// Id propio de api-fastify (el v2 toma de las otras APIs su primer registro, no
// busca por id). El 1 existe siempre: lo deja el seed de datos sintéticos.
const ARTICULO = __ENV.ARTICULO || '1'

// Respuesta completa = las dos dependencias vinieron sin error.
function esCompleta(respuesta) {
  try {
    const externas = respuesta.json('apis_externas')
    return Boolean(externas) && !externas.deportback?.error && !externas.inventario_u?.error
    // Cuerpo que no es JSON: no es una respuesta completa.
    // eslint-disable-next-line no-unused-vars
  } catch (error) {
    return false
  }
}

export default function () {
  // Un trace id único por petición, derivado de la ejecución: sirve para
  // buscar esa petición exacta en los logs de las tres nubes.
  const traceId = `${EJECUCION_ID}-${exec.vu.idInTest}-${exec.scenario.iterationInInstance}`
  const headers = { 'x-trace-id': traceId }
  if (API_KEY) headers['x-api-key'] = API_KEY

  const respuesta = http.get(`${BASE_URL}/api/v2/articulos/${encodeURIComponent(ARTICULO)}`, {
    headers,
    tags: { endpoint: 'flujo' },
    timeout: '15s'
  })

  const completo = esCompleta(respuesta)

  const exitoso = respuesta.status === 200 && completo
  flujoExito.add(exitoso)
  flujoDegradado.add(respuesta.status === 200 && !completo)
  tracePropagado.add(respuesta.headers['X-Trace-Id'] === traceId)

  check(respuesta, { 'flujo responde 200': (r) => r.status === 200 })
}

// Resumen de evidencia de la ejecución, con los campos que pide la entrega.
// No se inventa nada: lo que k6 no mide (MTTD, MTTR) no se escribe aquí, se
// calcula después a partir de la serie de tiempo y de las marcas del experimento.
export function handleSummary(datos) {
  const metrica = (nombre) => datos.metrics[nombre]?.values ?? {}
  const fin = new Date()
  const inicio = new Date(fin.getTime() - datos.state.testRunDurationMs)
  const peticiones = metrica('http_reqs')
  const fallidas = metrica('http_req_failed')
  const duracion = metrica('http_req_duration{endpoint:flujo}')

  const resultadoUmbrales = {}
  for (const [nombre, metricaDatos] of Object.entries(datos.metrics)) {
    for (const [regla, cumplido] of Object.entries(metricaDatos.thresholds ?? {})) {
      resultadoUmbrales[`${nombre} ${regla}`] = cumplido.ok
    }
  }

  const evidencia = {
    execution_id: EJECUCION_ID,
    round: RONDA,
    experiment: EXPERIMENTO,
    inicio_utc: inicio.toISOString(),
    fin_utc: fin.toISOString(),
    perfil: ESCALONES,
    requests_total: peticiones.count ?? null,
    errores_http: fallidas.passes ?? null,
    tasa_error_http: fallidas.rate ?? null,
    flujos_exitosos_tasa: metrica('flujo_exito').rate ?? null,
    flujos_degradados_tasa: metrica('flujo_degradado').rate ?? null,
    trace_id_devuelto_tasa: metrica('trace_id_devuelto').rate ?? null,
    latencia_ms: {
      p50: duracion.med ?? null,
      p90: duracion['p(90)'] ?? null,
      p95: duracion['p(95)'] ?? null,
      p99: duracion['p(99)'] ?? null,
      max: duracion.max ?? null
    },
    throughput_rps: peticiones.rate ?? null,
    iteraciones_descartadas: metrica('dropped_iterations').count ?? 0,
    umbrales: Object.keys(resultadoUmbrales).length ? resultadoUmbrales : 'sin umbrales declarados',
    mttd: 'no medido por k6',
    mttr: 'no medido por k6'
  }

  return { [`${RESULTADOS_DIR}/${EJECUCION_ID}.json`]: JSON.stringify(evidencia, null, 2) }
}
