import { createServer } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { pool } from '../../src/config/db.js'

const app = buildApp()

let productoFinalId
let ingredienteId
let recetaId
let servidorDeportback
let servidorInventarioU

beforeAll(async () => {
  const producto = await app.inject({
    method: 'POST',
    url: '/articulos',
    payload: { nombre: 'Pan de molde', tipo: 'producto_final', unidad_medida: 'unidades' }
  })
  productoFinalId = producto.json().id

  const ingrediente = await app.inject({
    method: 'POST',
    url: '/articulos',
    payload: { nombre: 'Harina de fuerza', tipo: 'materia_prima', unidad_medida: 'kg' }
  })
  ingredienteId = ingrediente.json().id

  const receta = await app.inject({
    method: 'POST',
    url: '/recetas',
    payload: {
      producto_final_id: productoFinalId,
      ingredientes: [{ articulo_id: ingredienteId, cantidad_necesaria: 1 }]
    }
  })
  recetaId = receta.json().id
})

afterAll(async () => {
  await app.inject({ method: 'DELETE', url: `/recetas/${recetaId}` })
  await app.inject({ method: 'DELETE', url: `/articulos/${productoFinalId}` })
  await app.inject({ method: 'DELETE', url: `/articulos/${ingredienteId}` })
  await app.close()
  await pool.end()
  if (servidorDeportback) servidorDeportback.close()
  if (servidorInventarioU) servidorInventarioU.close()
})

describe('módulo v2 receta', () => {
  it('GET /api/v2/recetas/:id responde 404 si la receta no existe', async () => {
    const respuesta = await app.inject({ method: 'GET', url: '/api/v2/recetas/999999' })
    expect(respuesta.statusCode).toBe(404)
  })

  it('GET /api/v2/recetas/:id devuelve la receta exacta y el top 1 real de deportback e inventario_u', async () => {
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

    const respuesta = await app.inject({ method: 'GET', url: `/api/v2/recetas/${recetaId}` })

    expect(respuesta.statusCode).toBe(200)
    expect(respuesta.headers['x-trace-id']).toBeTruthy()
    const cuerpo = respuesta.json()
    expect(cuerpo.receta.id).toBe(recetaId)
    expect(cuerpo.apis_externas.deportback).toEqual({ id: 'd1', nombre: 'Deportista de prueba' })
    expect(cuerpo.apis_externas.inventario_u).toEqual({ id: 1, codigo: 'SKU-1', nombre: 'Sku de prueba' })

    delete process.env.DEPORTBACK_URL
    delete process.env.INVENTARIO_U_URL
  })

  it('GET /api/v2/recetas/top degrada con gracia cuando las apis externas no están configuradas', async () => {
    const respuesta = await app.inject({ method: 'GET', url: '/api/v2/recetas/top' })

    expect(respuesta.statusCode).toBe(200)
    const cuerpo = respuesta.json()
    expect(cuerpo.receta).toHaveProperty('id')
    expect(cuerpo.apis_externas.deportback).toHaveProperty('error')
    expect(cuerpo.apis_externas.inventario_u).toHaveProperty('error')
  })
})
