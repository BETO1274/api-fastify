import { createServer } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { pool } from '../../src/config/db.js'
import { crearArticulo } from '../../src/modules/articulo/articulo.controller.js'

const app = buildApp()

let articuloId
let servidorDeportback
let servidorInventarioU

beforeAll(async () => {
  const articulo = await crearArticulo({
    nombre: 'Azúcar refinada',
    tipo: 'materia_prima',
    unidad_medida: 'kg'
  })
  articuloId = articulo.id
})

afterAll(async () => {
  await app.close()
  await pool.end()
  if (servidorDeportback) servidorDeportback.close()
  if (servidorInventarioU) servidorInventarioU.close()
})

describe('módulo v2 articulo', () => {
  it('GET /api/v2/articulos/:id responde 404 si el artículo no existe', async () => {
    const respuesta = await app.inject({
      method: 'GET',
      url: '/api/v2/articulos/999999'
    })

    expect(respuesta.statusCode).toBe(404)
  })

  it('GET /api/v2/articulos/:id degrada con gracia cuando las apis externas no están configuradas', async () => {
    delete process.env.DEPORTBACK_URL
    delete process.env.INVENTARIO_U_URL

    const respuesta = await app.inject({
      method: 'GET',
      url: `/api/v2/articulos/${articuloId}`
    })

    expect(respuesta.statusCode).toBe(200)
    const cuerpo = respuesta.json()
    expect(cuerpo.articulo.id).toBe(articuloId)
    expect(cuerpo.apis_externas.deportback).toHaveProperty('error')
    expect(cuerpo.apis_externas.inventario_u).toHaveProperty('error')
  })

  it('GET /api/v2/articulos/:id trae los datos reales de deportback e inventario-u y propaga el trace-id', async () => {
    servidorDeportback = createServer((req, res) => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify([{ id: 'd1', nombre: 'Deportista de prueba' }]))
    }).listen(0)
    servidorInventarioU = createServer((req, res) => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify([{ id: 1, codigo: 'SKU-1', nombre: 'Sku de prueba' }]))
    }).listen(0)

    process.env.DEPORTBACK_URL = `http://127.0.0.1:${servidorDeportback.address().port}`
    process.env.INVENTARIO_U_URL = `http://127.0.0.1:${servidorInventarioU.address().port}`

    const respuesta = await app.inject({
      method: 'GET',
      url: `/api/v2/articulos/${articuloId}`,
      headers: { 'x-trace-id': 'trace-de-prueba-123' }
    })

    expect(respuesta.statusCode).toBe(200)
    expect(respuesta.headers['x-trace-id']).toBe('trace-de-prueba-123')

    const cuerpo = respuesta.json()
    expect(cuerpo.apis_externas.deportback).toEqual({ id: 'd1', nombre: 'Deportista de prueba' })
    expect(cuerpo.apis_externas.inventario_u).toEqual({ id: 1, codigo: 'SKU-1', nombre: 'Sku de prueba' })

    delete process.env.DEPORTBACK_URL
    delete process.env.INVENTARIO_U_URL
  })

  it('GET /api/v2/articulos/top siempre usa datos reales, nunca ids inventados', async () => {
    const servidorDeportbackTop = createServer((req, res) => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify([{ id: 'd1', nombre: 'Deportista top' }]))
    }).listen(0)
    const servidorInventarioUTop = createServer((req, res) => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify([{ id: 1, codigo: 'SKU-1', nombre: 'Sku top' }]))
    }).listen(0)

    process.env.DEPORTBACK_URL = `http://127.0.0.1:${servidorDeportbackTop.address().port}`
    process.env.INVENTARIO_U_URL = `http://127.0.0.1:${servidorInventarioUTop.address().port}`

    const respuesta = await app.inject({
      method: 'GET',
      url: '/api/v2/articulos/top'
    })

    expect(respuesta.statusCode).toBe(200)
    const cuerpo = respuesta.json()
    expect(cuerpo.articulo).toHaveProperty('id')
    expect(cuerpo.apis_externas.deportback).toEqual({ id: 'd1', nombre: 'Deportista top' })
    expect(cuerpo.apis_externas.inventario_u).toEqual({ id: 1, codigo: 'SKU-1', nombre: 'Sku top' })

    delete process.env.DEPORTBACK_URL
    delete process.env.INVENTARIO_U_URL
    servidorDeportbackTop.close()
    servidorInventarioUTop.close()
  })

  it('limpieza: elimina el artículo de prueba', async () => {
    const respuesta = await app.inject({
      method: 'DELETE',
      url: `/articulos/${articuloId}`
    })

    expect(respuesta.statusCode).toBe(204)
  })
})
