import { Type } from '@sinclair/typebox'

export const FabricacionParams = Type.Object({
  id: Type.Integer()
})

export const FabricacionBody = Type.Object({
  receta_id: Type.Integer(),
  cantidad_producir: Type.Number({ exclusiveMinimum: 0 })
})

export const FabricacionBodyParcial = Type.Partial(FabricacionBody)

export const FabricacionQueryBody = Type.Object({
  receta_id: Type.Optional(Type.Integer())
})

export const FabricacionResponse = Type.Object({
  id: Type.Integer(),
  receta_id: Type.Integer(),
  cantidad_producir: Type.String(),
  fecha: Type.String()
})
