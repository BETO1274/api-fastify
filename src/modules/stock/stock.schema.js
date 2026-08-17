import { Type } from '@sinclair/typebox'

export const StockParams = Type.Object({
  id: Type.Integer()
})

export const StockBody = Type.Object({
  articulo_id: Type.Integer(),
  cantidad: Type.Number({ minimum: 0 }),
  ubicacion: Type.String({ minLength: 1 })
})

export const StockBodyParcial = Type.Partial(StockBody)

export const StockQueryBody = Type.Object({
  articulo_id: Type.Optional(Type.Integer()),
  ubicacion: Type.Optional(Type.String())
})

export const StockResponse = Type.Object({
  id: Type.Integer(),
  articulo_id: Type.Integer(),
  cantidad: Type.String(),
  ubicacion: Type.String(),
  creado_en: Type.String(),
  actualizado_en: Type.String()
})
