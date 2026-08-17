import { Type } from '@sinclair/typebox'

export const RecetaParams = Type.Object({
  id: Type.Integer()
})

export const IngredienteBody = Type.Object({
  articulo_id: Type.Integer(),
  cantidad_necesaria: Type.Number({ exclusiveMinimum: 0 })
})

export const RecetaBody = Type.Object({
  producto_final_id: Type.Integer(),
  ingredientes: Type.Array(IngredienteBody, { minItems: 1 })
})

export const RecetaBodyParcial = Type.Partial(RecetaBody)

export const RecetaQueryBody = Type.Object({
  producto_final_id: Type.Optional(Type.Integer())
})

export const IngredienteResponse = Type.Object({
  articulo_id: Type.Integer(),
  cantidad_necesaria: Type.String()
})

export const RecetaResponse = Type.Object({
  id: Type.Integer(),
  producto_final_id: Type.Integer(),
  ingredientes: Type.Array(IngredienteResponse),
  creado_en: Type.String(),
  actualizado_en: Type.String()
})
