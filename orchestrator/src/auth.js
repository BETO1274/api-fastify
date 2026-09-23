import { timingSafeEqual } from 'node:crypto'
import { Buffer } from 'node:buffer'

// Compara la key recibida contra TEAM_API_KEY sin filtrar información por
// tiempo de respuesta. Mismo patrón que usa gateway/src/proxy.routes.js.
function claveValida(recibida, esperada) {
  if (typeof recibida !== 'string') return false
  const a = Buffer.from(recibida)
  const b = Buffer.from(esperada)
  return a.length === b.length && timingSafeEqual(a, b)
}

// Si TEAM_API_KEY está configurada, exige que quien llama la mande en
// X-Api-Key. Protege /orquestar aunque el Service de Kubernetes quedara mal
// configurado como público por error — el gateway es la única puerta
// pensada, pero esto es una segunda capa, no la única.
export async function exigirApiKey(request, reply) {
  const claveEsperada = process.env.TEAM_API_KEY
  if (!claveEsperada) return

  if (!claveValida(request.headers['x-api-key'], claveEsperada)) {
    return reply.code(401).send({ mensaje: 'x-api-key inválida o ausente' })
  }
}
