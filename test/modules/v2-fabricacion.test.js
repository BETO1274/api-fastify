import { createServer } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { pool } from '../../src/config/db.js'

const app = buildApp()

let productoFinalId
let insumoId
let recetaId
let fabricacionId
let servidorDeportback
let servidorInventarioU

beforeAll(async () => {
  const producto = await app.inject({
    method: 'POST',
    url: '/articulos',
    payload: { nombre: 'Galletas integrales', tipo: 'producto_final', unidad_medida: 'unidades' }
  })
  productoFinalId = producto.json().id

  const insumo = await app.inject({
    method: 'POST',
    url: '/articulos',
    payload: { nombre: 'Avena molida', tipo: 'materia_prima', unidad_medida: 'kg' }
  })
  insumoId = insumo.json().id

  await app.inject({
    method: 'POST',
    url: '/stock',
    payload: { articulo_id: insumoId, cantidad: 100, ubicacion: 'Bodega A' }
  })

  const receta = await app.inject({
    method: 'POST',
    url: '/recetas',
    payload: {
      producto_final_id: productoFinalId,
      ingredientes: [{ articulo_id: insumoId, cantidad_necesaria: 2 }]
    }
  })
  recetaId = receta.json().id

  const fabricacion = await app.inject({
    method: 'POST',
    url: '/fabricaciones',
    payload: { receta_id: recetaId, cantidad_producir: 5 }
  })
  fabricacionId = fabricacion.json().id
})

afterAll(async () => {
  await app.inject({ method: 'DELETE', url: `/fabricaciones/${fabricacionId}` })
  await pool.query('delete from stock where articulo_id = any($1)', [[insumoId, productoFinalId]])
  await app.inject({ method: 'DELETE', url: `/recetas/${recetaId}` })
  await app.inject({ method: 'DELETE', url: `/articulos/${productoFinalId}` })
  await app.inject({ method: 'DELETE', url: `/articulos/${insumoId}` })
  await app.close()
  await pool.end()
  if (servidorDeportback) servidorDeportback.close()
  if (servidorInventarioU) servidorInventarioU.close()
})

describe('módulo v2 fabricacion', () => {
  it('GET /api/v2/fabricaciones/:id responde 404 si la fabricación no existe', async () => {
    const respuesta = await app.inject({ method: 'GET', url: '/api/v2/fabricaciones/999999' })
    expect(respuesta.statusCode).toBe(404)
  })

  it('GET /api/v2/fabricaciones/:id devuelve la fabricación exacta y el top 1 real de deportback e inventario_u', async () => {
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

    const respuesta = await app.inject({ method: 'GET', url: `/api/v2/fabricaciones/${fabricacionId}` })

    expect(respuesta.statusCode).toBe(200)
    expect(respuesta.headers['x-trace-id']).toBeTruthy()
    const cuerpo = respuesta.json()
    expect(cuerpo.fabricacion.id).toBe(fabricacionId)
    expect(cuerpo.apis_externas.deportback).toEqual({ id: 'd1', nombre: 'Deportista de prueba' })
    expect(cuerpo.apis_externas.inventario_u).toEqual({ id: 1, codigo: 'SKU-1', nombre: 'Sku de prueba' })

    delete process.env.DEPORTBACK_URL
    delete process.env.INVENTARIO_U_URL
  })

  it('GET /api/v2/fabricaciones/top degrada con gracia cuando las apis externas no están configuradas', async () => {
    const respuesta = await app.inject({ method: 'GET', url: '/api/v2/fabricaciones/top' })

    expect(respuesta.statusCode).toBe(200)
    const cuerpo = respuesta.json()
    expect(cuerpo.fabricacion).toHaveProperty('id')
    expect(cuerpo.apis_externas.deportback).toHaveProperty('error')
    expect(cuerpo.apis_externas.inventario_u).toHaveProperty('error')
  })
})
