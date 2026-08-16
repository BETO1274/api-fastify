import { Type } from '@sinclair/typebox'

export const ArticuloParams = Type.Object({
  id: Type.Integer()
})

export const ArticuloBody = Type.Object({
  nombre: Type.String({ minLength: 1 }),
  tipo: Type.Union([Type.Literal('materia_prima'), Type.Literal('producto_final')]),
  unidad_medida: Type.String({ minLength: 1 })
})

export const ArticuloBodyParcial = Type.Partial(ArticuloBody)

export const ArticuloQueryBody = Type.Object({
  nombre: Type.Optional(Type.String()),
  tipo: Type.Optional(Type.Union([Type.Literal('materia_prima'), Type.Literal('producto_final')])),
  unidad_medida: Type.Optional(Type.String())
})

export const ArticuloResponse = Type.Object({
  id: Type.Integer(),
  nombre: Type.String(),
  tipo: Type.String(),
  unidad_medida: Type.String(),
  creado_en: Type.String(),
  actualizado_en: Type.String()
})
