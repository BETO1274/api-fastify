import { createServer } from 'node:http'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { guardarEnStorage, obtenerDeStorage } from '../src/storage-cliente.js'

// Storage falso de Inventario-U: implementa el contrato real
// (POST /api/v2/storage -> 201, GET /api/v2/storage/:trace_id -> 200|404).
let servidor
let almacen
let recibidas = []

beforeAll(async () => {
  servidor = createServer((req, res) => {
    let cuerpo = ''
    req.on('data', (chunk) => { cuerpo += chunk })
    req.on('end', () => {
      recibidas.push({ metodo: req.method, url: req.url, apiKey: req.headers['x-api-key'], traceId: req.headers['x-trace-id'] })

      if (req.method === 'POST' && req.url === '/api/v2/storage') {
        const { trace_id, data } = JSON.parse(cuerpo)
        almacen.set(trace_id, data)
        res.writeHead(201, { 'content-type': 'application/json' })
        return res.end(JSON.stringify({ trace_id, object_name: `flujos/${trace_id}.json`, bucket: 'inventario-u-storage', status: 'stored' }))
      }

      if (req.method === 'GET' && req.url.startsWith('/api/v2/storage/')) {
        const traceId = decodeURIComponent(req.url.slice('/api/v2/storage/'.length))
        if (!almacen.has(traceId)) {
          res.writeHead(404, { 'content-type': 'application/json' })
          return res.end(JSON.stringify({ mensaje: 'no encontrado' }))
        }
        res.writeHead(200, { 'content-type': 'application/json' })
        return res.end(JSON.stringify(almacen.get(traceId)))
      }

      res.writeHead(404)
      res.end()
    })
  })
  await new Promise((resolver) => servidor.listen(0, resolver))
})

afterAll(async () => {
  await new Promise((resolver) => servidor.close(resolver))
})

afterEach(() => {
  almacen = new Map()
  recibidas = []
  delete process.env.STORAGE_URL
  delete process.env.TEAM_API_KEY
})

describe('guardarEnStorage / obtenerDeStorage', () => {
  it('devuelve undefined si STORAGE_URL no está configurada', async () => {
    expect(await obtenerDeStorage('trace-1')).toBeUndefined()
  })

  it('guarda y después recupera el mismo dato', async () => {
    almacen = new Map()
    process.env.STORAGE_URL = `http://127.0.0.1:${servidor.address().port}`

    await guardarEnStorage('trace-1', { status: 200, datos: [1, 2, 3] })
    const valor = await obtenerDeStorage('trace-1')

    expect(valor).toEqual({ status: 200, datos: [1, 2, 3] })
  })

  it('devuelve undefined si el trace_id no existe (404)', async () => {
    almacen = new Map()
    process.env.STORAGE_URL = `http://127.0.0.1:${servidor.address().port}`

    expect(await obtenerDeStorage('no-existe')).toBeUndefined()
  })

  it('manda X-Api-Key y X-Trace-Id, y el body con trace_id + data', async () => {
    almacen = new Map()
    process.env.STORAGE_URL = `http://127.0.0.1:${servidor.address().port}`
    process.env.TEAM_API_KEY = 'clave-del-equipo'

    await guardarEnStorage('trace-xyz', { x: 1 })

    expect(recibidas[0].apiKey).toBe('clave-del-equipo')
    expect(recibidas[0].traceId).toBe('trace-xyz')
    expect(almacen.get('trace-xyz')).toEqual({ x: 1 })
  })

  it('no hace nada si no hay traceId', async () => {
    process.env.STORAGE_URL = `http://127.0.0.1:${servidor.address().port}`

    await guardarEnStorage(undefined, { x: 1 })

    expect(recibidas).toHaveLength(0)
  })

  it('no lanza error si el servidor de storage no responde', async () => {
    process.env.STORAGE_URL = 'http://127.0.0.1:1' // puerto cerrado

    await expect(guardarEnStorage('trace-1', { x: 1 })).resolves.toBeUndefined()
    await expect(obtenerDeStorage('trace-1')).resolves.toBeUndefined()
  })
})
