import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { limpiarTareas } from '../src/tareas-memoria.js'

afterEach(() => {
  limpiarTareas()
})

describe('health check', () => {
  it('GET /health responde 200', async () => {
    const app = buildApp()
    const respuesta = await app.inject({ method: 'GET', url: '/health' })

    expect(respuesta.statusCode).toBe(200)
    expect(respuesta.json()).toEqual({ status: 'ok' })
    await app.close()
  })
})

describe('POST /orquestar', () => {
  it('responde 202 y crea la tarea en estado pendiente', async () => {
    const app = buildApp()
    const respuesta = await app.inject({
      method: 'POST',
      url: '/orquestar',
      payload: {
        servicio: 'api_fastify',
        metodo: 'POST',
        ruta: '/fabricaciones',
        body: { receta_id: 5, cantidad_producir: 10 }
      }
    })

    expect(respuesta.statusCode).toBe(202)
    const cuerpo = respuesta.json()
    expect(cuerpo.id).toBeTypeOf('string')
    expect(cuerpo.estado).toBe('pendiente')
    expect(cuerpo.servicio).toBe('api_fastify')
    await app.close()
  })

  it('responde 400 si servicio no es uno de los 3 valores válidos', async () => {
    const app = buildApp()
    const respuesta = await app.inject({
      method: 'POST',
      url: '/orquestar',
      payload: { servicio: 'otro_servicio', metodo: 'GET', ruta: '/articulos' }
    })

    expect(respuesta.statusCode).toBe(400)
    await app.close()
  })

  it('responde 400 si metodo no es uno de los verbos válidos', async () => {
    const app = buildApp()
    const respuesta = await app.inject({
      method: 'POST',
      url: '/orquestar',
      payload: { servicio: 'api_fastify', metodo: 'TRACE', ruta: '/articulos' }
    })

    expect(respuesta.statusCode).toBe(400)
    await app.close()
  })

  it('responde 400 si ruta no empieza con /', async () => {
    const app = buildApp()
    const respuesta = await app.inject({
      method: 'POST',
      url: '/orquestar',
      payload: { servicio: 'api_fastify', metodo: 'GET', ruta: 'articulos' }
    })

    expect(respuesta.statusCode).toBe(400)
    await app.close()
  })
})

describe('GET /orquestar/:id', () => {
  it('devuelve la tarea creada', async () => {
    const app = buildApp()
    const creacion = await app.inject({
      method: 'POST',
      url: '/orquestar',
      payload: { servicio: 'inventario_u', metodo: 'GET', ruta: '/skus' }
    })
    const id = creacion.json().id

    const respuesta = await app.inject({ method: 'GET', url: `/orquestar/${id}` })

    expect(respuesta.statusCode).toBe(200)
    expect(respuesta.json().id).toBe(id)
    await app.close()
  })

  it('responde 404 si la tarea no existe', async () => {
    const app = buildApp()
    const respuesta = await app.inject({ method: 'GET', url: '/orquestar/no-existe' })

    expect(respuesta.statusCode).toBe(404)
    await app.close()
  })
})
