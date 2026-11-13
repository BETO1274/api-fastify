// Interruptor propio de caos: latencia SALIENTE hacia las otras APIs del equipo
// (deportBack, Inventario-U). Es independiente de common/caos.js, que inyecta
// fallos ENTRANTES y solo existe en el track canary.
//
// Cubre lo que la herramienta declarativa (Chaos Mesh) no resuelve bien: un
// fallo desde el propio código, activable en caliente y atribuible a una
// dependencia concreta. Reglas de seguridad:
//
//   * Solo existe con CAOS_SALIENTE_HABILITADO=true y TEAM_API_KEY configurada;
//     todos los endpoints exigen x-api-key.
//   * Toda activación exige una duración (máximo 30 min). El vencimiento lo
//     aplica el propio proceso: si el controlador muere, el fallo se apaga
//     solo. Nunca queda activo indefinidamente.
//   * Latencia acotada a 10 s y limitada a las dos APIs del grupo.
//   * El estado vive en memoria de cada réplica; el script
//     chaos/latencia-saliente.sh lo aplica a todas.
import { timingSafeEqual } from 'node:crypto'
import { Buffer } from 'node:buffer'
import client from 'prom-client'
import { Type } from '@sinclair/typebox'
import { registro } from './metricas.js'

export const SERVICIOS_CAOS = ['deportback', 'inventario_u']
export const LIMITE_LATENCIA_MS = 10000
export const LIMITE_DURACION_S = 1800

const activas = new Map() // servicio -> { latenciaMs, expiraEn }

export function activarLatencia({ servicio, latenciaMs, duracionS }, ahora = Date.now()) {
  const objetivos = servicio === 'todos' ? SERVICIOS_CAOS : [servicio]
  if (!objetivos.every((nombre) => SERVICIOS_CAOS.includes(nombre))) {
    throw new RangeError(`servicio desconocido: ${servicio}`)
  }
  if (!Number.isInteger(latenciaMs) || latenciaMs < 1 || latenciaMs > LIMITE_LATENCIA_MS) {
    throw new RangeError(`latencia_ms debe estar entre 1 y ${LIMITE_LATENCIA_MS}`)
  }
  if (!Number.isInteger(duracionS) || duracionS < 1 || duracionS > LIMITE_DURACION_S) {
    throw new RangeError(`duracion_s es obligatoria y debe estar entre 1 y ${LIMITE_DURACION_S}`)
  }
  for (const nombre of objetivos) {
    activas.set(nombre, { latenciaMs, expiraEn: ahora + duracionS * 1000 })
  }
  return estadoCaos(ahora)
}

export function desactivarCaos() {
  activas.clear()
}

// Latencia que hay que inyectar ahora hacia ese servicio (0 si no hay o si ya
// venció). Limpia lo vencido, así no depende de nadie que lo apague.
export function latenciaVigente(servicio, ahora = Date.now()) {
  const entrada = activas.get(servicio)
  if (!entrada) return 0
  if (ahora >= entrada.expiraEn) {
    activas.delete(servicio)
    return 0
  }
  return entrada.latenciaMs
}

export function estadoCaos(ahora = Date.now()) {
  return SERVICIOS_CAOS
    .filter((servicio) => latenciaVigente(servicio, ahora) > 0)
    .map((servicio) => {
      const { latenciaMs, expiraEn } = activas.get(servicio)
      return {
        servicio,
        latencia_ms: latenciaMs,
        expira_en: new Date(expiraEn).toISOString(),
        restante_s: Math.ceil((expiraEn - ahora) / 1000)
      }
    })
}

// Ventana de inyección para el tablero: vale 1 mientras el fallo está activo y
// 0 cuando vence, calculado en cada scrape de Prometheus.
export const caosInyeccionActiva = new client.Gauge({
  name: 'caos_inyeccion_activa',
  help: 'Vale 1 mientras hay un fallo inyectado activo (tipo y servicio afectado)',
  labelNames: ['tipo', 'servicio'],
  registers: [registro],
  collect() {
    for (const servicio of SERVICIOS_CAOS) {
      this.set({ tipo: 'latencia_saliente', servicio }, latenciaVigente(servicio) > 0 ? 1 : 0)
    }
  }
})

export const caosLatenciaInyectadaMs = new client.Gauge({
  name: 'caos_latencia_inyectada_ms',
  help: 'Latencia que se está inyectando ahora hacia cada API (0 si no hay)',
  labelNames: ['servicio'],
  registers: [registro],
  collect() {
    for (const servicio of SERVICIOS_CAOS) {
      this.set({ servicio }, latenciaVigente(servicio))
    }
  }
})

export const caosLatenciaAplicadaTotal = new client.Counter({
  name: 'caos_latencia_aplicada_total',
  help: 'Llamadas a las que se les inyectó latencia, por API',
  labelNames: ['servicio'],
  registers: [registro]
})

const CaosBody = Type.Object({
  servicio: Type.Union([...SERVICIOS_CAOS, 'todos'].map((nombre) => Type.Literal(nombre))),
  latencia_ms: Type.Integer({ minimum: 1, maximum: LIMITE_LATENCIA_MS }),
  // Obligatoria a propósito: sin duración no hay forma de activar el fallo.
  duracion_s: Type.Integer({ minimum: 1, maximum: LIMITE_DURACION_S })
}, { additionalProperties: false })

function claveValida(recibida, esperada) {
  if (typeof recibida !== 'string') return false
  const a = Buffer.from(recibida)
  const b = Buffer.from(esperada)
  return a.length === b.length && timingSafeEqual(a, b)
}

// Registra /admin/caos-saliente (GET, POST, DELETE). No se registra si no se
// habilita expresamente, ni sin TEAM_API_KEY (quedaría como un control
// administrativo abierto).
export function registrarCaosSaliente(app) {
  if (process.env.CAOS_SALIENTE_HABILITADO !== 'true') return
  if (!process.env.TEAM_API_KEY) {
    app.log.error('CAOS_SALIENTE_HABILITADO=true ignorado: sin TEAM_API_KEY los controles de caos quedarían sin proteger')
    return
  }

  app.register(async (fastify) => {
    // onRequest: la clave se exige ANTES de validar el cuerpo, para no
    // revelar el esquema a quien no la tiene.
    fastify.addHook('onRequest', async (request, reply) => {
      if (!claveValida(request.headers['x-api-key'], process.env.TEAM_API_KEY)) {
        return reply.code(401).send({ mensaje: 'x-api-key inválida o ausente' })
      }
    })

    fastify.get('/admin/caos-saliente', { schema: { hide: true } }, async () => ({ activos: estadoCaos() }))

    fastify.post('/admin/caos-saliente', { schema: { hide: true, body: CaosBody } }, async (request) => {
      const { servicio, latencia_ms: latenciaMs, duracion_s: duracionS } = request.body
      const activos = activarLatencia({ servicio, latenciaMs, duracionS })
      request.log.warn({ servicio, latencia_ms: latenciaMs, duracion_s: duracionS }, 'caos: latencia saliente ACTIVADA')
      return { activos }
    })

    fastify.delete('/admin/caos-saliente', { schema: { hide: true } }, async (request) => {
      desactivarCaos()
      request.log.warn('caos: latencia saliente DESACTIVADA')
      return { activos: [] }
    })
  })
}
