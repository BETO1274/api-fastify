import { createServer } from 'node:http'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { despachar } from '../src/dispatcher.js'
import { registro } from '../src/metricas.js'

// API de destino falsa: registra los headers que le llegan.
let servidor
let recibidas = []

beforeAll(async () => {
  servidor = createServer((req, res) => {
    recibidas.push({
      metodo: req.method,
      url: req.url,
      traceId: req.headers['x-trace-id'],
      apiKey: req.headers['x-api-key'],
      contentType: req.headers['content-type']
    })
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ ok: true }))
  })
  await new Promise((resolver) => servidor.listen(0, resolver))
})

afterAll(async () => {
  await new Promise((resolver) => servidor.close(resolver))
})

afterEach(() => {
  recibidas = []
  delete process.env.API_FASTIFY_URL
  delete process.env.TEAM_API_KEY
})

describe('despachar', () => {
  it('reenvía exactamente el traceId recibido, no inventa uno nuevo', async () => {
    process.env.API_FASTIFY_URL = `http://127.0.0.1:${servidor.address().port}`

    await despachar({
      servicio: 'api_fastify',
      metodo: 'GET',
      ruta: '/articulos/1',
      traceId: 'trace-de-la-tarea-original'
    })

    expect(recibidas[0].traceId).toBe('trace-de-la-tarea-original')
  })

  it('manda TEAM_API_KEY si está configurada', async () => {
    process.env.API_FASTIFY_URL = `http://127.0.0.1:${servidor.address().port}`
    process.env.TEAM_API_KEY = 'clave-del-equipo'

    await despachar({ servicio: 'api_fastify', metodo: 'GET', ruta: '/articulos', traceId: 'x' })

    expect(recibidas[0].apiKey).toBe('clave-del-equipo')
  })

  it('lanza error si el servicio no tiene URL configurada', async () => {
    await expect(
      despachar({ servicio: 'deportback', metodo: 'GET', ruta: '/deportistas', traceId: 'x' })
    ).rejects.toThrow('no hay URL configurada')
  })

  it('lanza error si el servicio no es uno de los 3 conocidos', async () => {
    await expect(
      despachar({ servicio: 'otro', metodo: 'GET', ruta: '/x', traceId: 'x' })
    ).rejects.toThrow('servicio desconocido')
  })

  // Regresión: mandar Content-Type: application/json sin body hace que
  // Fastify del otro lado rechace la petición con 400 (body vacío
  // declarado como JSON). GET y DELETE nunca llevan body, así que nunca
  // deben llevar este header tampoco.
  it('no manda Content-Type en GET (no hay body)', async () => {
    process.env.API_FASTIFY_URL = `http://127.0.0.1:${servidor.address().port}`

    await despachar({ servicio: 'api_fastify', metodo: 'GET', ruta: '/articulos', traceId: 'x' })

    expect(recibidas[0].contentType).toBeUndefined()
  })

  it('no manda Content-Type en DELETE (no hay body)', async () => {
    process.env.API_FASTIFY_URL = `http://127.0.0.1:${servidor.address().port}`

    await despachar({ servicio: 'api_fastify', metodo: 'DELETE', ruta: '/articulos/1', traceId: 'x' })

    expect(recibidas[0].contentType).toBeUndefined()
  })

  it('sí manda Content-Type en POST con body', async () => {
    process.env.API_FASTIFY_URL = `http://127.0.0.1:${servidor.address().port}`

    await despachar({ servicio: 'api_fastify', metodo: 'POST', ruta: '/articulos', body: { nombre: 'x' }, traceId: 'x' })

    expect(recibidas[0].contentType).toBe('application/json')
  })

  it('cuenta la llamada exitosa en dispatcher_llamadas_total, con el servicio como label', async () => {
    process.env.API_FASTIFY_URL = `http://127.0.0.1:${servidor.address().port}`

    await despachar({ servicio: 'api_fastify', metodo: 'GET', ruta: '/articulos', traceId: 'x' })

    const metricas = await registro.getMetricsAsJSON()
    const contador = metricas.find((m) => m.name === 'dispatcher_llamadas_total')
    const valor = contador.values.find((v) => v.labels.servicio === 'api_fastify' && v.labels.resultado === 'exito')
    expect(valor.value).toBeGreaterThan(0)
  })
})
