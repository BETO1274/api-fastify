import { afterAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { pool } from '../../src/config/db.js'

const app = buildApp()

afterAll(async () => {
  await app.close()
  await pool.end()
})

describe('módulo articulo', () => {
  let articuloCreadoId

  it('POST /articulos crea un artículo', async () => {
    const respuesta = await app.inject({
      method: 'POST',
      url: '/articulos',
      payload: {
        nombre: 'Harina de trigo',
        tipo: 'materia_prima',
        unidad_medida: 'kg'
      }
    })

    expect(respuesta.statusCode).toBe(201)
    const cuerpo = respuesta.json()
    expect(cuerpo.nombre).toBe('Harina de trigo')
    articuloCreadoId = cuerpo.id
  })

  it('GET /articulos/:id obtiene el artículo creado', async () => {
    const respuesta = await app.inject({
      method: 'GET',
      url: `/articulos/${articuloCreadoId}`
    })

    expect(respuesta.statusCode).toBe(200)
    expect(respuesta.json().id).toBe(articuloCreadoId)
  })

  it('GET /articulos/:id responde 404 si no existe', async () => {
    const respuesta = await app.inject({
      method: 'GET',
      url: '/articulos/999999'
    })

    expect(respuesta.statusCode).toBe(404)
  })

  it('PATCH /articulos/:id actualiza parcialmente', async () => {
    const respuesta = await app.inject({
      method: 'PATCH',
      url: `/articulos/${articuloCreadoId}`,
      payload: { unidad_medida: 'toneladas' }
    })

    expect(respuesta.statusCode).toBe(200)
    expect(respuesta.json().unidad_medida).toBe('toneladas')
  })

  it('QUERY /articulos/search busca por tipo', async () => {
    const respuesta = await app.inject({
      method: 'QUERY',
      url: '/articulos/search',
      payload: { tipo: 'materia_prima' }
    })

    expect(respuesta.statusCode).toBe(200)
    const resultados = respuesta.json()
    expect(Array.isArray(resultados)).toBe(true)
    expect(resultados.some((articulo) => articulo.id === articuloCreadoId)).toBe(true)
  })

  it('QUERY /articulos/search busca por nombre parcial', async () => {
    const respuesta = await app.inject({
      method: 'QUERY',
      url: '/articulos/search',
      payload: { nombre: 'harina' }
    })

    expect(respuesta.statusCode).toBe(200)
    expect(respuesta.json().some((articulo) => articulo.id === articuloCreadoId)).toBe(true)
  })

  it('QUERY /articulos/search busca por unidad_medida', async () => {
    const respuesta = await app.inject({
      method: 'QUERY',
      url: '/articulos/search',
      payload: { unidad_medida: 'toneladas' }
    })

    expect(respuesta.statusCode).toBe(200)
    expect(respuesta.json().some((articulo) => articulo.id === articuloCreadoId)).toBe(true)
  })

  it('PATCH /articulos/:id sin cambios devuelve el artículo intacto', async () => {
    const respuesta = await app.inject({
      method: 'PATCH',
      url: `/articulos/${articuloCreadoId}`,
      payload: {}
    })

    expect(respuesta.statusCode).toBe(200)
    expect(respuesta.json().id).toBe(articuloCreadoId)
  })

  it('PATCH /articulos/:id responde 404 si no existe', async () => {
    const respuesta = await app.inject({
      method: 'PATCH',
      url: '/articulos/999999',
      payload: { nombre: 'no existe' }
    })

    expect(respuesta.statusCode).toBe(404)
  })

  it('DELETE /articulos/:id elimina el artículo', async () => {
    const respuesta = await app.inject({
      method: 'DELETE',
      url: `/articulos/${articuloCreadoId}`
    })

    expect(respuesta.statusCode).toBe(204)
  })

  it('DELETE /articulos/:id responde 404 si ya no existe', async () => {
    const respuesta = await app.inject({
      method: 'DELETE',
      url: `/articulos/${articuloCreadoId}`
    })

    expect(respuesta.statusCode).toBe(404)
  })
})
