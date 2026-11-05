import { afterAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { pool } from '../../src/config/db.js'

const app = buildApp()

afterAll(async () => {
  await pool.query("delete from articulo where nombre like 'Prueba categoria%'")
  await app.close()
  await pool.end()
})

describe('articulo.categoria (v4, expand)', () => {
  let conCategoriaId
  let sinCategoriaId

  it('POST /articulos guarda y devuelve la categoria', async () => {
    const respuesta = await app.inject({
      method: 'POST',
      url: '/articulos',
      payload: { nombre: 'Prueba categoria A', tipo: 'materia_prima', unidad_medida: 'kg', categoria: 'harinas' }
    })

    expect(respuesta.statusCode).toBe(201)
    expect(respuesta.json().categoria).toBe('harinas')
    conCategoriaId = respuesta.json().id
  })

  it('POST /articulos sin categoria sigue funcionando (compatible con v3)', async () => {
    const respuesta = await app.inject({
      method: 'POST',
      url: '/articulos',
      payload: { nombre: 'Prueba categoria B', tipo: 'materia_prima', unidad_medida: 'kg' }
    })

    expect(respuesta.statusCode).toBe(201)
    expect(respuesta.json().categoria).toBeNull()
    sinCategoriaId = respuesta.json().id
  })

  it('PATCH /articulos/:id actualiza la categoria', async () => {
    const respuesta = await app.inject({
      method: 'PATCH',
      url: `/articulos/${sinCategoriaId}`,
      payload: { categoria: 'azucares' }
    })

    expect(respuesta.statusCode).toBe(200)
    expect(respuesta.json().categoria).toBe('azucares')
  })

  it('QUERY /articulos/search filtra por categoria', async () => {
    const respuesta = await app.inject({
      method: 'QUERY',
      url: '/articulos/search',
      payload: { categoria: 'harinas' }
    })

    expect(respuesta.statusCode).toBe(200)
    const ids = respuesta.json().map((articulo) => articulo.id)
    expect(ids).toContain(conCategoriaId)
    expect(ids).not.toContain(sinCategoriaId)
  })
})
