import { createServer } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { pool } from '../../src/config/db.js'

const app = buildApp()

let articuloId
let stockId
let servidorDeportback
let servidorInventarioU

beforeAll(async () => {
  const articulo = await app.inject({
    method: 'POST',
    url: '/articulos',
    payload: { nombre: 'Levadura', tipo: 'materia_prima', unidad_medida: 'kg' }
  })
  articuloId = articulo.json().id

  const stock = await app.inject({
    method: 'POST',
    url: '/stock',
    payload: { articulo_id: articuloId, cantidad: 20, ubicacion: 'Bodega A' }
  })
  stockId = stock.json().id
})

afterAll(async () => {
  await app.inject({ method: 'DELETE', url: `/stock/${stockId}` })
  await app.inject({ method: 'DELETE', url: `/articulos/${articuloId}` })
  await app.close()
  await pool.end()
  if (servidorDeportback) servidorDeportback.close()
  if (servidorInventarioU) servidorInventarioU.close()
})

describe('módulo v2 stock', () => {
  it('GET /api/v2/stock/:id responde 404 si el stock no existe', async () => {
    const respuesta = await app.inject({ method: 'GET', url: '/api/v2/stock/999999' })
    expect(respuesta.statusCode).toBe(404)
  })

  it('GET /api/v2/stock/:id devuelve el stock exacto y el top 1 real de deportback e inventario_u', async () => {
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

    const respuesta = await app.inject({ method: 'GET', url: `/api/v2/stock/${stockId}` })

    expect(respuesta.statusCode).toBe(200)
    expect(respuesta.headers['x-trace-id']).toBeTruthy()
    const cuerpo = respuesta.json()
    expect(cuerpo.stock.id).toBe(stockId)
    expect(cuerpo.apis_externas.deportback).toEqual({ id: 'd1', nombre: 'Deportista de prueba' })
    expect(cuerpo.apis_externas.inventario_u).toEqual({ id: 1, codigo: 'SKU-1', nombre: 'Sku de prueba' })

    delete process.env.DEPORTBACK_URL
    delete process.env.INVENTARIO_U_URL
  })

  it('GET /api/v2/stock/top degrada con gracia cuando las apis externas no están configuradas', async () => {
    const respuesta = await app.inject({ method: 'GET', url: '/api/v2/stock/top' })

    expect(respuesta.statusCode).toBe(200)
    const cuerpo = respuesta.json()
    expect(cuerpo.stock).toHaveProperty('id')
    expect(cuerpo.apis_externas.deportback).toHaveProperty('error')
    expect(cuerpo.apis_externas.inventario_u).toHaveProperty('error')
  })
})
