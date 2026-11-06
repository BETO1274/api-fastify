import http from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ejecutarCarga, limpiar } from '../carga.mjs'

// API falsa en memoria: POST /articulos, GET /articulos/:id, busqueda y DELETE.
const articulos = new Map()
let siguienteId = 1
let servidor
let url

beforeAll(async () => {
  servidor = http.createServer((req, res) => {
    const partes = []
    req.on('data', (parte) => partes.push(parte))
    req.on('end', () => {
      const raw = Buffer.concat(partes).toString()
      const cuerpo = raw ? JSON.parse(raw) : {}
      const cabeceras = { 'content-type': 'application/json', 'x-routed-to': 'stable' }
      const reply = (codigo, datos) => {
        res.writeHead(codigo, cabeceras)
        res.end(datos === undefined ? '' : JSON.stringify(datos))
      }

      if (req.method === 'POST' && req.url === '/articulos') {
        const articulo = { id: siguienteId++, ...cuerpo }
        articulos.set(articulo.id, articulo)
        return reply(201, articulo)
      }
      if (req.method === 'POST' && req.url === '/articulos/search') {
        const lista = [...articulos.values()].filter((a) => a.nombre.includes(cuerpo.nombre))
        return reply(200, lista)
      }
      const id = Number(req.url.split('/')[2])
      if (req.method === 'GET' && articulos.has(id)) return reply(200, articulos.get(id))
      if (req.method === 'DELETE') {
        // Igual que Fastify: DELETE con content-type json y sin cuerpo es un 400
        if (req.headers['content-type'] && !raw) return reply(400, { mensaje: 'Body cannot be empty' })
        const existia = articulos.delete(id)
        return reply(existia ? 204 : 404)
      }
      return reply(404, {})
    })
  })
  await new Promise((resolver) => servidor.listen(0, '127.0.0.1', resolver))
  url = `http://127.0.0.1:${servidor.address().port}`
})

afterAll(() => servidor.close())

describe('generador de carga', () => {
  it('mezcla lecturas y creaciones y reporta por track', async () => {
    const resumen = await ejecutarCarga({ router: url, duracionSeg: 1, concurrencia: 4, rps: 100 })

    expect(resumen.total).toBeGreaterThan(10)
    expect(resumen.por_track.stable).toBe(resumen.total)
    expect(resumen.por_estado['2xx']).toBe(resumen.total)
    expect(articulos.size).toBeGreaterThan(1)
  })

  it('limpiar borra los articulos creados por la carga', async () => {
    const antes = articulos.size
    const borrados = await limpiar(url)

    expect(borrados).toBe(antes)
    expect(articulos.size).toBe(0)
  })
})
