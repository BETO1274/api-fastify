import { createServer } from 'node:http'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { claveDeCache, guardarEnCache, obtenerDeCache } from '../src/cache-cliente.js'

// Cache falsa de deportBack: implementa el contrato real
// (GET /cache/:key -> 200|404, POST /cache -> 201) sobre un Map en memoria.
let servidor
let almacen
let recibidas = []

beforeAll(async () => {
  servidor = createServer((req, res) => {
    let cuerpo = ''
    req.on('data', (chunk) => { cuerpo += chunk })
    req.on('end', () => {
      recibidas.push({ metodo: req.method, url: req.url, apiKey: req.headers['x-api-key'], traceId: req.headers['x-trace-id'] })

      if (req.method === 'POST' && req.url === '/cache') {
        const { key, value, ttl } = JSON.parse(cuerpo)
        almacen.set(key, value)
        res.writeHead(201, { 'content-type': 'application/json' })
        return res.end(JSON.stringify({ key, ttl }))
      }

      if (req.method === 'GET' && req.url.startsWith('/cache/')) {
        const key = decodeURIComponent(req.url.slice('/cache/'.length))
        if (!almacen.has(key)) {
          res.writeHead(404, { 'content-type': 'application/json' })
          return res.end(JSON.stringify({ message: 'no encontrado' }))
        }
        res.writeHead(200, { 'content-type': 'application/json' })
        return res.end(JSON.stringify({ key, value: almacen.get(key) }))
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
  delete process.env.CACHE_URL
  delete process.env.TEAM_API_KEY
})

describe('claveDeCache', () => {
  it('arma la key a partir de servicio, metodo y ruta', () => {
    expect(claveDeCache({ servicio: 'api_fastify', metodo: 'GET', ruta: '/articulos' }))
      .toBe('api_fastify:GET:~articulos')
  })

  it('reemplaza toda "/" — el Controller de destino no soporta "/" en :key', () => {
    expect(claveDeCache({ servicio: 'inventario_u', metodo: 'GET', ruta: '/inventario/query' }))
      .toBe('inventario_u:GET:~inventario~query')
  })
})

describe('obtenerDeCache / guardarEnCache', () => {
  it('devuelve undefined si CACHE_URL no está configurada', async () => {
    expect(await obtenerDeCache('x', 'trace-1')).toBeUndefined()
  })

  it('guarda y después recupera el mismo valor', async () => {
    almacen = new Map()
    process.env.CACHE_URL = `http://127.0.0.1:${servidor.address().port}`

    await guardarEnCache('api_fastify:GET:/articulos', { datos: [1, 2, 3] }, 'trace-1')
    const valor = await obtenerDeCache('api_fastify:GET:/articulos', 'trace-1')

    expect(valor).toEqual({ datos: [1, 2, 3] })
  })

  it('devuelve undefined si la key no existe (404)', async () => {
    almacen = new Map()
    process.env.CACHE_URL = `http://127.0.0.1:${servidor.address().port}`

    expect(await obtenerDeCache('no-existe', 'trace-1')).toBeUndefined()
  })

  it('manda X-Api-Key y X-Trace-Id en ambas llamadas', async () => {
    almacen = new Map()
    process.env.CACHE_URL = `http://127.0.0.1:${servidor.address().port}`
    process.env.TEAM_API_KEY = 'clave-del-equipo'

    await guardarEnCache('k', 'v', 'trace-xyz')
    await obtenerDeCache('k', 'trace-xyz')

    expect(recibidas.every((r) => r.apiKey === 'clave-del-equipo')).toBe(true)
    expect(recibidas.every((r) => r.traceId === 'trace-xyz')).toBe(true)
  })

  it('no lanza error si el servidor de cache no responde', async () => {
    process.env.CACHE_URL = 'http://127.0.0.1:1' // puerto cerrado

    await expect(guardarEnCache('k', 'v', 'trace-1')).resolves.toBeUndefined()
    await expect(obtenerDeCache('k', 'trace-1')).resolves.toBeUndefined()
  })
})
