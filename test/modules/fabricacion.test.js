import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { pool } from '../../src/config/db.js'

const app = buildApp()

let productoFinalId
let insumoId
let recetaId
let stockInsumoId
let fabricacionNegativaId
let insumoSinStockId
let recetaSinStockId
let fabricacionSinStockId

beforeAll(async () => {
  const producto = await app.inject({
    method: 'POST',
    url: '/articulos',
    payload: { nombre: 'Galletas de avena', tipo: 'producto_final', unidad_medida: 'unidades' }
  })
  productoFinalId = producto.json().id

  const insumo = await app.inject({
    method: 'POST',
    url: '/articulos',
    payload: { nombre: 'Avena en hojuelas', tipo: 'materia_prima', unidad_medida: 'kg' }
  })
  insumoId = insumo.json().id

  const stock = await app.inject({
    method: 'POST',
    url: '/stock',
    payload: { articulo_id: insumoId, cantidad: 100, ubicacion: 'Bodega A' }
  })
  stockInsumoId = stock.json().id

  const receta = await app.inject({
    method: 'POST',
    url: '/recetas',
    payload: {
      producto_final_id: productoFinalId,
      ingredientes: [{ articulo_id: insumoId, cantidad_necesaria: 2 }]
    }
  })
  recetaId = receta.json().id
})

afterAll(async () => {
  if (fabricacionNegativaId) {
    await app.inject({ method: 'DELETE', url: `/fabricaciones/${fabricacionNegativaId}` })
  }
  if (fabricacionSinStockId) {
    await app.inject({ method: 'DELETE', url: `/fabricaciones/${fabricacionSinStockId}` })
  }
  await pool.query('delete from stock where articulo_id = any($1)', [[insumoId, productoFinalId, insumoSinStockId]])
  if (recetaSinStockId) {
    await app.inject({ method: 'DELETE', url: `/recetas/${recetaSinStockId}` })
  }
  if (insumoSinStockId) {
    await app.inject({ method: 'DELETE', url: `/articulos/${insumoSinStockId}` })
  }
  await app.inject({ method: 'DELETE', url: `/recetas/${recetaId}` })
  await app.inject({ method: 'DELETE', url: `/articulos/${productoFinalId}` })
  await app.inject({ method: 'DELETE', url: `/articulos/${insumoId}` })
  await app.close()
  await pool.end()
})

describe('módulo fabricacion', () => {
  let fabricacionCreadaId

  it('POST /fabricaciones registra la orden, descuenta insumos e incrementa el producto final', async () => {
    const respuesta = await app.inject({
      method: 'POST',
      url: '/fabricaciones',
      payload: { receta_id: recetaId, cantidad_producir: 10 }
    })

    expect(respuesta.statusCode).toBe(201)
    const cuerpo = respuesta.json()
    expect(cuerpo.receta_id).toBe(recetaId)
    fabricacionCreadaId = cuerpo.id

    const stockInsumo = await app.inject({ method: 'GET', url: `/stock/${stockInsumoId}` })
    expect(stockInsumo.json().cantidad).toBe('80')

    const stockProducto = await app.inject({
      method: 'QUERY',
      url: '/stock/search',
      payload: { articulo_id: productoFinalId }
    })
    expect(stockProducto.json().some((fila) => Number(fila.cantidad) === 10)).toBe(true)
  })

  it('POST /fabricaciones responde 400 si cantidad_producir no es positiva', async () => {
    const respuesta = await app.inject({
      method: 'POST',
      url: '/fabricaciones',
      payload: { receta_id: recetaId, cantidad_producir: 0 }
    })

    expect(respuesta.statusCode).toBe(400)
  })

  it('POST /fabricaciones crea el stock del insumo en negativo cuando nunca existió una fila previa', async () => {
    const insumo = await app.inject({
      method: 'POST',
      url: '/articulos',
      payload: { nombre: 'Esencia de vainilla', tipo: 'materia_prima', unidad_medida: 'ml' }
    })
    insumoSinStockId = insumo.json().id

    const receta = await app.inject({
      method: 'POST',
      url: '/recetas',
      payload: {
        producto_final_id: productoFinalId,
        ingredientes: [{ articulo_id: insumoSinStockId, cantidad_necesaria: 3 }]
      }
    })
    recetaSinStockId = receta.json().id

    const respuesta = await app.inject({
      method: 'POST',
      url: '/fabricaciones',
      payload: { receta_id: recetaSinStockId, cantidad_producir: 5 }
    })

    expect(respuesta.statusCode).toBe(201)
    fabricacionSinStockId = respuesta.json().id

    const stockInsumo = await app.inject({
      method: 'QUERY',
      url: '/stock/search',
      payload: { articulo_id: insumoSinStockId }
    })
    const filas = stockInsumo.json()
    expect(filas).toHaveLength(1)
    expect(Number(filas[0].cantidad)).toBe(-15)
  })

  it('POST /fabricaciones responde 404 si la receta no existe', async () => {
    const respuesta = await app.inject({
      method: 'POST',
      url: '/fabricaciones',
      payload: { receta_id: 999999, cantidad_producir: 5 }
    })

    expect(respuesta.statusCode).toBe(404)
  })

  it('POST /fabricaciones permite que el stock del insumo quede negativo si no alcanza', async () => {
    const respuesta = await app.inject({
      method: 'POST',
      url: '/fabricaciones',
      payload: { receta_id: recetaId, cantidad_producir: 1000 }
    })

    expect(respuesta.statusCode).toBe(201)
    fabricacionNegativaId = respuesta.json().id

    const stockInsumo = await app.inject({ method: 'GET', url: `/stock/${stockInsumoId}` })
    expect(Number(stockInsumo.json().cantidad)).toBeLessThan(0)
  })

  it('GET /fabricaciones/:id obtiene la fabricación creada', async () => {
    const respuesta = await app.inject({ method: 'GET', url: `/fabricaciones/${fabricacionCreadaId}` })
    expect(respuesta.statusCode).toBe(200)
    expect(respuesta.json().id).toBe(fabricacionCreadaId)
  })

  it('GET /fabricaciones/:id responde 404 si no existe', async () => {
    const respuesta = await app.inject({ method: 'GET', url: '/fabricaciones/999999' })
    expect(respuesta.statusCode).toBe(404)
  })

  it('PATCH /fabricaciones/:id actualiza parcialmente', async () => {
    const respuesta = await app.inject({
      method: 'PATCH',
      url: `/fabricaciones/${fabricacionCreadaId}`,
      payload: { cantidad_producir: 15 }
    })
    expect(respuesta.statusCode).toBe(200)
    expect(respuesta.json().cantidad_producir).toBe('15')
  })

  it('PATCH /fabricaciones/:id sin cambios devuelve el registro intacto', async () => {
    const respuesta = await app.inject({
      method: 'PATCH',
      url: `/fabricaciones/${fabricacionCreadaId}`,
      payload: {}
    })
    expect(respuesta.statusCode).toBe(200)
    expect(respuesta.json().id).toBe(fabricacionCreadaId)
  })

  it('PATCH /fabricaciones/:id responde 404 si no existe', async () => {
    const respuesta = await app.inject({
      method: 'PATCH',
      url: '/fabricaciones/999999',
      payload: { cantidad_producir: 1 }
    })
    expect(respuesta.statusCode).toBe(404)
  })

  it('QUERY /fabricaciones/search busca por receta_id', async () => {
    const respuesta = await app.inject({
      method: 'QUERY',
      url: '/fabricaciones/search',
      payload: { receta_id: recetaId }
    })
    expect(respuesta.statusCode).toBe(200)
    expect(respuesta.json().some((fabricacion) => fabricacion.id === fabricacionCreadaId)).toBe(true)
  })

  it('DELETE /fabricaciones/:id elimina el registro', async () => {
    const respuesta = await app.inject({ method: 'DELETE', url: `/fabricaciones/${fabricacionCreadaId}` })
    expect(respuesta.statusCode).toBe(204)
  })

  it('DELETE /fabricaciones/:id responde 404 si ya no existe', async () => {
    const respuesta = await app.inject({ method: 'DELETE', url: `/fabricaciones/${fabricacionCreadaId}` })
    expect(respuesta.statusCode).toBe(404)
  })
})
