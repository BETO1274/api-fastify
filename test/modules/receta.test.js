import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { pool } from '../../src/config/db.js'

const app = buildApp()

let productoFinalId
let ingredienteId

beforeAll(async () => {
  const producto = await app.inject({
    method: 'POST',
    url: '/articulos',
    payload: { nombre: 'Pan integral', tipo: 'producto_final', unidad_medida: 'unidades' }
  })
  productoFinalId = producto.json().id

  const ingrediente = await app.inject({
    method: 'POST',
    url: '/articulos',
    payload: { nombre: 'Harina integral', tipo: 'materia_prima', unidad_medida: 'kg' }
  })
  ingredienteId = ingrediente.json().id
})

afterAll(async () => {
  await app.inject({ method: 'DELETE', url: `/articulos/${productoFinalId}` })
  await app.inject({ method: 'DELETE', url: `/articulos/${ingredienteId}` })
  await app.close()
  await pool.end()
})

describe('módulo receta', () => {
  let recetaCreadaId

  it('POST /recetas crea una receta con sus ingredientes', async () => {
    const respuesta = await app.inject({
      method: 'POST',
      url: '/recetas',
      payload: {
        producto_final_id: productoFinalId,
        ingredientes: [{ articulo_id: ingredienteId, cantidad_necesaria: 0.5 }]
      }
    })

    expect(respuesta.statusCode).toBe(201)
    const cuerpo = respuesta.json()
    expect(cuerpo.producto_final_id).toBe(productoFinalId)
    expect(cuerpo.ingredientes).toHaveLength(1)
    recetaCreadaId = cuerpo.id
  })

  it('GET /recetas/:id obtiene la receta con sus ingredientes', async () => {
    const respuesta = await app.inject({
      method: 'GET',
      url: `/recetas/${recetaCreadaId}`
    })

    expect(respuesta.statusCode).toBe(200)
    const cuerpo = respuesta.json()
    expect(cuerpo.id).toBe(recetaCreadaId)
    expect(cuerpo.ingredientes[0].articulo_id).toBe(ingredienteId)
  })

  it('GET /recetas/:id responde 404 si no existe', async () => {
    const respuesta = await app.inject({
      method: 'GET',
      url: '/recetas/999999'
    })

    expect(respuesta.statusCode).toBe(404)
  })

  it('PATCH /recetas/:id reemplaza la lista de ingredientes', async () => {
    const respuesta = await app.inject({
      method: 'PATCH',
      url: `/recetas/${recetaCreadaId}`,
      payload: {
        ingredientes: [{ articulo_id: ingredienteId, cantidad_necesaria: 1.2 }]
      }
    })

    expect(respuesta.statusCode).toBe(200)
    const cuerpo = respuesta.json()
    expect(cuerpo.ingredientes).toHaveLength(1)
    expect(cuerpo.ingredientes[0].cantidad_necesaria).toBe('1.2')
  })

  it('PATCH /recetas/:id sin cambios devuelve la receta intacta', async () => {
    const respuesta = await app.inject({
      method: 'PATCH',
      url: `/recetas/${recetaCreadaId}`,
      payload: {}
    })

    expect(respuesta.statusCode).toBe(200)
    expect(respuesta.json().id).toBe(recetaCreadaId)
  })

  it('PATCH /recetas/:id responde 404 si no existe', async () => {
    const respuesta = await app.inject({
      method: 'PATCH',
      url: '/recetas/999999',
      payload: { producto_final_id: productoFinalId }
    })

    expect(respuesta.statusCode).toBe(404)
  })

  it('QUERY /recetas/search busca por producto_final_id', async () => {
    const respuesta = await app.inject({
      method: 'QUERY',
      url: '/recetas/search',
      payload: { producto_final_id: productoFinalId }
    })

    expect(respuesta.statusCode).toBe(200)
    const resultados = respuesta.json()
    expect(Array.isArray(resultados)).toBe(true)
    expect(resultados.some((receta) => receta.id === recetaCreadaId)).toBe(true)
  })

  it('DELETE /recetas/:id elimina la receta y sus ingredientes', async () => {
    const respuesta = await app.inject({
      method: 'DELETE',
      url: `/recetas/${recetaCreadaId}`
    })

    expect(respuesta.statusCode).toBe(204)
  })

  it('DELETE /recetas/:id responde 404 si ya no existe', async () => {
    const respuesta = await app.inject({
      method: 'DELETE',
      url: `/recetas/${recetaCreadaId}`
    })

    expect(respuesta.statusCode).toBe(404)
  })
})
