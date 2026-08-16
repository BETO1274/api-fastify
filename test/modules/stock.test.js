import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { pool } from '../../src/config/db.js'

const app = buildApp()

let articuloId

beforeAll(async () => {
  const respuestaArticulo = await app.inject({
    method: 'POST',
    url: '/articulos',
    payload: {
      nombre: 'Azúcar refinada',
      tipo: 'materia_prima',
      unidad_medida: 'kg'
    }
  })
  articuloId = respuestaArticulo.json().id
})

afterAll(async () => {
  await app.inject({ method: 'DELETE', url: `/articulos/${articuloId}` })
  await app.close()
  await pool.end()
})

describe('módulo stock', () => {
  let stockCreadoId

  it('POST /stock crea un registro de stock', async () => {
    const respuesta = await app.inject({
      method: 'POST',
      url: '/stock',
      payload: {
        articulo_id: articuloId,
        cantidad: 100,
        ubicacion: 'Bodega A'
      }
    })

    expect(respuesta.statusCode).toBe(201)
    const cuerpo = respuesta.json()
    expect(cuerpo.ubicacion).toBe('Bodega A')
    stockCreadoId = cuerpo.id
  })

  it('GET /stock/:id obtiene el registro creado', async () => {
    const respuesta = await app.inject({
      method: 'GET',
      url: `/stock/${stockCreadoId}`
    })

    expect(respuesta.statusCode).toBe(200)
    expect(respuesta.json().id).toBe(stockCreadoId)
  })

  it('GET /stock/:id responde 404 si no existe', async () => {
    const respuesta = await app.inject({
      method: 'GET',
      url: '/stock/999999'
    })

    expect(respuesta.statusCode).toBe(404)
  })

  it('PATCH /stock/:id actualiza parcialmente', async () => {
    const respuesta = await app.inject({
      method: 'PATCH',
      url: `/stock/${stockCreadoId}`,
      payload: { ubicacion: 'Bodega B' }
    })

    expect(respuesta.statusCode).toBe(200)
    expect(respuesta.json().ubicacion).toBe('Bodega B')
  })

  it('PATCH /stock/:id sin cambios devuelve el registro intacto', async () => {
    const respuesta = await app.inject({
      method: 'PATCH',
      url: `/stock/${stockCreadoId}`,
      payload: {}
    })

    expect(respuesta.statusCode).toBe(200)
    expect(respuesta.json().id).toBe(stockCreadoId)
  })

  it('PATCH /stock/:id responde 404 si no existe', async () => {
    const respuesta = await app.inject({
      method: 'PATCH',
      url: '/stock/999999',
      payload: { ubicacion: 'no existe' }
    })

    expect(respuesta.statusCode).toBe(404)
  })

  it('QUERY /stock/search busca por articulo_id', async () => {
    const respuesta = await app.inject({
      method: 'QUERY',
      url: '/stock/search',
      payload: { articulo_id: articuloId }
    })

    expect(respuesta.statusCode).toBe(200)
    const resultados = respuesta.json()
    expect(Array.isArray(resultados)).toBe(true)
    expect(resultados.some((stock) => stock.id === stockCreadoId)).toBe(true)
  })

  it('QUERY /stock/search busca por ubicacion', async () => {
    const respuesta = await app.inject({
      method: 'QUERY',
      url: '/stock/search',
      payload: { ubicacion: 'Bodega B' }
    })

    expect(respuesta.statusCode).toBe(200)
    expect(respuesta.json().some((stock) => stock.id === stockCreadoId)).toBe(true)
  })

  it('DELETE /stock/:id elimina el registro', async () => {
    const respuesta = await app.inject({
      method: 'DELETE',
      url: `/stock/${stockCreadoId}`
    })

    expect(respuesta.statusCode).toBe(204)
  })

  it('DELETE /stock/:id responde 404 si ya no existe', async () => {
    const respuesta = await app.inject({
      method: 'DELETE',
      url: `/stock/${stockCreadoId}`
    })

    expect(respuesta.statusCode).toBe(404)
  })
})
