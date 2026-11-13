// Llama a una API externa del equipo (deportBack, Inventario-U) con timeout
// y sin propagar el error: si la API externa falla o no responde a tiempo,
// se retorna { ok: false, error } para que el endpoint local pueda seguir
// respondiendo con degradación elegante en vez de romperse por completo.
//
// Configuración por variables de entorno. Los valores por defecto dejan el
// comportamiento exactamente como era antes (Ronda 0: timeout de 5 s y
// degradación, sin circuit breaker):
//
//   HTTP_EXTERNO_TIMEOUT_MS  espera máxima por dependencia (defecto 5000).
//                            Debe salir de la latencia p95 medida de cada API.
//   CB_ACTIVO                "true" activa el circuit breaker (Ronda 1).
//   CB_UMBRAL_FALLOS         fallos consecutivos que abren el circuito (3).
//   CB_ENFRIAMIENTO_MS       tiempo abierto antes de probar de nuevo (30000).
import { ErrorDependencia, obtenerCircuito } from './circuit-breaker.js'
import { latenciaVigente, caosLatenciaAplicadaTotal } from './caos-saliente.js'
import { dependenciaLlamadasTotal, dependenciaDuracionSegundos } from './metricas.js'

const TIMEOUT_POR_DEFECTO_MS = 5000

function numeroPositivo(valor, porDefecto) {
  const numero = Number(valor)
  return Number.isFinite(numero) && numero > 0 ? numero : porDefecto
}

export function leerConfigExterna(env = process.env) {
  return {
    timeoutMs: numeroPositivo(env.HTTP_EXTERNO_TIMEOUT_MS, TIMEOUT_POR_DEFECTO_MS),
    circuitoActivo: env.CB_ACTIVO === 'true',
    umbralFallos: numeroPositivo(env.CB_UMBRAL_FALLOS, 3),
    enfriamientoMs: numeroPositivo(env.CB_ENFRIAMIENTO_MS, 30000)
  }
}

// Espera `ms` pero se corta con la señal de aborto: la latencia inyectada
// cuenta contra el timeout igual que una dependencia lenta de verdad.
function esperar(ms, senal) {
  return new Promise((resolver, rechazar) => {
    const abortar = () => {
      clearTimeout(temporizador)
      rechazar(Object.assign(new Error('abortado'), { name: 'AbortError' }))
    }
    const temporizador = setTimeout(() => {
      senal.removeEventListener('abort', abortar)
      resolver()
    }, ms)
    if (senal.aborted) return abortar()
    senal.addEventListener('abort', abortar, { once: true })
  })
}

async function llamarUnaVez(url, { traceId, timeoutMs, servicio }) {
  const controlador = new AbortController()
  const temporizador = setTimeout(() => controlador.abort(), timeoutMs)

  try {
    const headers = {}
    if (traceId) headers['x-trace-id'] = traceId
    // Se envía a las otras 2 APIs del equipo para que puedan validar que la
    // llamada viene de una de las APIs autorizadas (ver src/versions/v2.js).
    if (process.env.TEAM_API_KEY) headers['x-api-key'] = process.env.TEAM_API_KEY

    // Interruptor de caos: latencia saliente hacia esta dependencia (0 si no hay).
    const latenciaInyectadaMs = latenciaVigente(servicio)
    if (latenciaInyectadaMs > 0) {
      caosLatenciaAplicadaTotal.inc({ servicio })
      await esperar(latenciaInyectadaMs, controlador.signal)
    }

    const respuesta = await fetch(url, { signal: controlador.signal, headers })

    if (!respuesta.ok) {
      // Libera la conexión: el cuerpo de un error no se lee.
      await respuesta.body?.cancel().catch(() => {})
      const esFallaDelServicio = respuesta.status >= 500
      throw new ErrorDependencia(
        esFallaDelServicio ? 'http_5xx' : 'http_4xx',
        `respuesta ${respuesta.status} de ${url}`,
        { status: respuesta.status, cuentaParaCircuito: esFallaDelServicio }
      )
    }

    return await respuesta.json()
  } catch (error) {
    if (error instanceof ErrorDependencia) throw error
    if (error.name === 'AbortError') {
      throw new ErrorDependencia('timeout', `tiempo de espera agotado (${timeoutMs}ms) para ${url}`)
    }
    if (error instanceof SyntaxError) {
      throw new ErrorDependencia('respuesta_invalida', error.message)
    }
    throw new ErrorDependencia('conexion', error.message)
  } finally {
    clearTimeout(temporizador)
  }
}

function registrar(servicio, resultado, inicio) {
  dependenciaLlamadasTotal.inc({ servicio, resultado })
  dependenciaDuracionSegundos.observe({ servicio }, Number(process.hrtime.bigint() - inicio) / 1e9)
}

export async function fetchConTimeout(url, { traceId, timeoutMs, servicio = 'externo' } = {}) {
  const config = leerConfigExterna()
  const opciones = { traceId, timeoutMs: timeoutMs ?? config.timeoutMs, servicio }
  const inicio = process.hrtime.bigint()

  try {
    const llamar = () => llamarUnaVez(url, opciones)
    const data = config.circuitoActivo
      ? await obtenerCircuito(servicio, config).ejecutar(llamar)
      : await llamar()
    registrar(servicio, 'ok', inicio)
    return { ok: true, data }
  } catch (error) {
    registrar(servicio, error.tipo ?? 'desconocido', inicio)
    return { ok: false, error: error.message }
  }
}
