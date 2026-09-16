import { Type } from '@sinclair/typebox'

export const SERVICIOS_VALIDOS = ['api_fastify', 'deportback', 'inventario_u']
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
  creadaEn: Type.String()
})

export const OrquestarParams = Type.Object({
  id: Type.String()
})
