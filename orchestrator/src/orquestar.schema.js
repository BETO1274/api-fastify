import { Type } from '@sinclair/typebox'

// v3: ya no hay conexión con las APIs de los otros equipos (deportBack,
// Inventario-U) — el orquestador solo despacha contra nuestra propia API.
export const SERVICIOS_VALIDOS = ['api_fastify']
export const METODOS_VALIDOS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'QUERY']

export const OrquestarBody = Type.Object({
  servicio: Type.Union(SERVICIOS_VALIDOS.map((s) => Type.Literal(s))),
  metodo: Type.Union(METODOS_VALIDOS.map((m) => Type.Literal(m))),
  ruta: Type.String({ pattern: '^/' }),
  body: Type.Optional(Type.Any())
})

export const TareaResponse = Type.Object({
  id: Type.String(),
  servicio: Type.String(),
  metodo: Type.String(),
  ruta: Type.String(),
  estado: Type.String(),
  resultado: Type.Any(),
  creadaEn: Type.String(),
  traceId: Type.Optional(Type.String())
})

export const OrquestarParams = Type.Object({
  id: Type.String()
})
