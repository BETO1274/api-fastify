import { timingSafeEqual } from 'node:crypto'
import { Buffer } from 'node:buffer'

const METODOS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'QUERY']
const METODOS_SIN_BODY = ['GET', 'DELETE']
const SERVICIOS = ['api_fastify', 'deportback', 'inventario_u']
const TIMEOUT_MS = 10000

// Compara la key sin filtrar información por tiempo de respuesta.
function claveValida(recibida, esperada) {
  if (typeof recibida !== 'string') return false
  const a = Buffer.from(recibida)
  const b = Buffer.from(esperada)
  return a.length === b.length && timingSafeEqual(a, b)
}

async function llamarOrquestador(ruta, { metodo, body, traceId }) {
  const urlBase = process.env.ORQUESTADOR_URL
  if (!urlBase) {
    const error = new Error('ORQUESTADOR_URL no configurada')
    error.codigo = 'SIN_CONFIGURAR'
    throw error
  }

  const controlador = new AbortController()
  const temporizador = setTimeout(() => controlador.abort(), TIMEOUT_MS)

  try {
    const headers = {
      'Content-Type': 'application/json',
      'X-Trace-Id': traceId
    }
    // El orquestador exige la misma key del equipo en lo que recibe (segunda
    // capa de defensa, además de que el Service quede como ClusterIP).
    if (process.env.TEAM_API_KEY) headers['X-Api-Key'] = process.env.TEAM_API_KEY

    const respuesta = await fetch(`${urlBase}${ruta}`, {
      method: metodo,
      signal: controlador.signal,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    return {
      status: respuesta.status,
      contentType: respuesta.headers.get('content-type'),
      texto: await respuesta.text()
    }
  } finally {
    clearTimeout(temporizador)
  }
}

// Devuelve al cliente exactamente lo que respondió el orquestador (status,
// content-type y cuerpo), sin reinterpretarlo.
async function reenviar(reply, ruta, opciones) {
  try {
    const { status, contentType, texto } = await llamarOrquestador(ruta, opciones)
    return reply.code(status).header('content-type', contentType ?? 'application/json').send(texto)
  } catch (error) {
    if (error.codigo === 'SIN_CONFIGURAR') {
      return reply.code(500).send({ mensaje: error.message })
    }
    if (error.name === 'AbortError') {
      return reply.code(504).send({ mensaje: 'el orquestador no respondió a tiempo' })
    }
    return reply.code(502).send({ mensaje: 'el orquestador no está disponible' })
  }
}

export default async function proxyRoutes(fastify) {
  // Todo lo que pasa por aquí exige la key del equipo (si está configurada) y
  // lleva un X-Trace-Id. /health queda fuera, se registra aparte en app.js.
  fastify.addHook('onRequest', async (request, reply) => {
    const traceId = request.headers['x-trace-id'] ?? crypto.randomUUID()
    request.traceId = traceId
    reply.header('x-trace-id', traceId)

    const claveEsperada = process.env.TEAM_API_KEY
    if (claveEsperada && !claveValida(request.headers['x-api-key'], claveEsperada)) {
      return reply.code(401).send({ mensaje: 'x-api-key inválida o ausente' })
    }
  })

  // Consultar el estado de una tarea encolada por el orquestador.
  fastify.get('/orquestar/:id', async (request, reply) => {
    return reenviar(reply, `/orquestar/${encodeURIComponent(request.params.id)}`, {
      metodo: 'GET',
      traceId: request.traceId
    })
  })

  // {método} /{servicio}/{ruta...}  ->  POST /orquestar {servicio, metodo, ruta, body}
  fastify.route({
    method: METODOS,
    url: '/:servicio/*',
    handler: async (request, reply) => {
      const { servicio } = request.params
      if (!SERVICIOS.includes(servicio)) {
        return reply.code(404).send({ mensaje: `servicio desconocido: ${servicio}` })
      }

      // request.url conserva el query string: "/api_fastify/articulos?x=1" -> "/articulos?x=1"
      const ruta = request.url.slice(servicio.length + 1)
      const body = METODOS_SIN_BODY.includes(request.method) ? undefined : request.body

      return reenviar(reply, '/orquestar', {
        metodo: 'POST',
        traceId: request.traceId,
        body: { servicio, metodo: request.method, ruta, body }
      })
    }
  })
}
