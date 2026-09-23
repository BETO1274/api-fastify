import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { limpiarTareas } from '../src/tareas-memoria.js'

afterEach(() => {
  limpiarTareas()
  delete process.env.TEAM_API_KEY
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

describe('trace id', () => {
  it('respeta el X-Trace-Id que llega, lo devuelve en el header y lo guarda con la tarea', async () => {
    const app = buildApp()

    const respuesta = await app.inject({
      method: 'POST',
      url: '/orquestar',
      headers: { 'x-trace-id': 'trace-del-gateway' },
      payload: { servicio: 'api_fastify', metodo: 'GET', ruta: '/articulos' }
    })

    expect(respuesta.headers['x-trace-id']).toBe('trace-del-gateway')
    expect(respuesta.json().traceId).toBe('trace-del-gateway')
    await app.close()
  })

  it('genera un X-Trace-Id si no llega ninguno', async () => {
    const app = buildApp()

    const respuesta = await app.inject({
      method: 'POST',
      url: '/orquestar',
      payload: { servicio: 'api_fastify', metodo: 'GET', ruta: '/articulos' }
    })

    expect(respuesta.headers['x-trace-id']).toBeTruthy()
    expect(respuesta.json().traceId).toBe(respuesta.headers['x-trace-id'])
    await app.close()
  })

  it('GET /orquestar/:id devuelve el mismo trace-id con el que se creó la tarea', async () => {
    const app = buildApp()

    const creacion = await app.inject({
      method: 'POST',
      url: '/orquestar',
      headers: { 'x-trace-id': 'trace-original' },
      payload: { servicio: 'api_fastify', metodo: 'GET', ruta: '/articulos' }
    })
    const id = creacion.json().id

    const respuesta = await app.inject({ method: 'GET', url: `/orquestar/${id}` })

    expect(respuesta.json().traceId).toBe('trace-original')
    expect(respuesta.headers['x-trace-id']).toBe('trace-original')
    await app.close()
  })
})

describe('control de acceso', () => {
  it('responde 401 en POST /orquestar si TEAM_API_KEY está configurada y la key falta o es incorrecta', async () => {
    process.env.TEAM_API_KEY = 'clave-del-equipo'
    const app = buildApp()

    const sinKey = await app.inject({
      method: 'POST',
      url: '/orquestar',
      payload: { servicio: 'api_fastify', metodo: 'GET', ruta: '/articulos' }
    })
    expect(sinKey.statusCode).toBe(401)

    const keyIncorrecta = await app.inject({
      method: 'POST',
      url: '/orquestar',
      headers: { 'x-api-key': 'otra-clave!!!!!!' },
      payload: { servicio: 'api_fastify', metodo: 'GET', ruta: '/articulos' }
    })
    expect(keyIncorrecta.statusCode).toBe(401)

    await app.close()
  })

  it('deja pasar POST /orquestar con la key correcta', async () => {
    process.env.TEAM_API_KEY = 'clave-del-equipo'
    const app = buildApp()

    const respuesta = await app.inject({
      method: 'POST',
      url: '/orquestar',
      headers: { 'x-api-key': 'clave-del-equipo' },
      payload: { servicio: 'api_fastify', metodo: 'GET', ruta: '/articulos' }
    })

    expect(respuesta.statusCode).toBe(202)
    await app.close()
  })

  it('responde 401 en GET /orquestar/:id sin la key correcta', async () => {
    process.env.TEAM_API_KEY = 'clave-del-equipo'
    const app = buildApp()

    const respuesta = await app.inject({ method: 'GET', url: '/orquestar/cualquier-id' })

    expect(respuesta.statusCode).toBe(401)
    await app.close()
  })

  it('GET /health no exige key', async () => {
    process.env.TEAM_API_KEY = 'clave-del-equipo'
    const app = buildApp()

    const respuesta = await app.inject({ method: 'GET', url: '/health' })

    expect(respuesta.statusCode).toBe(200)
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
