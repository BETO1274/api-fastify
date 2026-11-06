import http from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { crearLogs } from '../src/logs.js'
import { crearRouter } from '../src/router.js'

function levantar(servidor) {
  return new Promise((resolver) => {
    servidor.listen(0, '127.0.0.1', () => resolver(servidor.address().port))
  })
}

// API falsa: responde con su version y falla con un 500 puntual en /falla
function api(track, version) {
  return http.createServer((req, res) => {
    req.resume()
    req.on('end', () => {
      const cabeceras = { 'content-type': 'application/json', 'x-track': track, 'x-app-version': version }
      if (req.url.startsWith('/falla')) {
        res.writeHead(500, cabeceras)
        return res.end(JSON.stringify({ mensaje: 'Fallo inyectado (caos)' }))
      }
      res.writeHead(200, cabeceras)
      res.end(JSON.stringify({ track, version, requestId: req.headers['x-request-id'] }))
    })
  })
}

// Loki falso: guarda cada envio
function lokiFalso() {
  const envios = []
  const servidor = http.createServer((req, res) => {
    const partes = []
    req.on('data', (parte) => partes.push(parte))
    req.on('end', () => {
      envios.push({ headers: req.headers, cuerpo: JSON.parse(Buffer.concat(partes).toString()) })
      res.writeHead(204)
      res.end()
    })
  })
  return { servidor, envios }
}

function pedir(puerto, { ruta = '/articulos', headers = {} } = {}) {
  return new Promise((resolver, rechazar) => {
    const req = http.request({ host: '127.0.0.1', port: puerto, path: ruta, headers }, (res) => {
      const partes = []
      res.on('data', (parte) => partes.push(parte))
      res.on('end', () => resolver({ status: res.statusCode, headers: res.headers, texto: Buffer.concat(partes).toString() }))
    })
    req.on('error', rechazar)
    req.end()
  })
}

async function esperar(condicion, ms = 4000) {
  const limite = Date.now() + ms
  while (Date.now() < limite) {
    if (condicion()) return true
    await new Promise((resolver) => setTimeout(resolver, 25))
  }
  return false
}

let stable, canary, loki, puertoStable, puertoCanary, puertoLoki

beforeAll(async () => {
  stable = api('stable', '3.0.1')
  canary = api('canary', '4.0.0')
  loki = lokiFalso()
  puertoStable = await levantar(stable)
  puertoCanary = await levantar(canary)
  puertoLoki = await levantar(loki.servidor)
})

afterAll(() => {
  stable.close()
  canary.close()
  loki.servidor.close()
})

function nuevoRouter(opciones = {}) {
  const logs = crearLogs({
    url: `http://127.0.0.1:${puertoLoki}/loki/api/v1/push`,
    user: '1799784',
    token: 'glc_prueba',
    intervaloMs: 40
  })
  const { servidor } = crearRouter({
    stableUrl: `http://127.0.0.1:${opciones.puertoStable ?? puertoStable}`,
    canaryUrl: `http://127.0.0.1:${puertoCanary}`,
    pesoInicial: 0,
    logs
  })
  return { servidor, logs }
}

describe('logs de errores del router', () => {
  it('un 500 del canary llega a Loki con track, version, ruta, mensaje e id de peticion', async () => {
    const antes = loki.envios.length
    const { servidor, logs } = nuevoRouter()
    const puerto = await levantar(servidor)

    const r = await pedir(puerto, { ruta: '/falla?x=secreto', headers: { 'x-canary': 'true' } })
    await logs.vaciar()
    await esperar(() => loki.envios.length > antes)

    expect(r.status).toBe(500)
    const flujo = loki.envios.at(-1).cuerpo.streams[0]
    expect(flujo.stream).toEqual({ app: 'canary-router', level: 'error', track: 'canary', version: '4.0.0' })
    const linea = JSON.parse(flujo.values[0][1])
    expect(linea).toMatchObject({ status: 500, method: 'GET', path: '/falla', reason: 'header' })
    expect(linea.error).toContain('Fallo inyectado (caos)')
    expect(linea.request_id).toBe(r.headers['x-request-id'])
    expect(JSON.stringify(linea)).not.toContain('secreto')
    servidor.close()
  })

  it('las peticiones correctas no generan logs de error', async () => {
    const antes = loki.envios.length
    const { servidor, logs } = nuevoRouter()
    const puerto = await levantar(servidor)

    const r = await pedir(puerto)
    await logs.vaciar()

    expect(r.status).toBe(200)
    expect(loki.envios.length).toBe(antes)
    servidor.close()
  })

  it('toda respuesta lleva X-Request-Id y la API lo recibe', async () => {
    const { servidor } = nuevoRouter()
    const puerto = await levantar(servidor)

    const r = await pedir(puerto)
    const cuerpo = JSON.parse(r.texto)

    expect(r.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)
    expect(cuerpo.requestId).toBe(r.headers['x-request-id'])
    servidor.close()
  })

  it('respeta el X-Request-Id que ya trae la peticion', async () => {
    const { servidor } = nuevoRouter()
    const puerto = await levantar(servidor)

    const r = await pedir(puerto, { headers: { 'x-request-id': 'mi-id-123' } })

    expect(r.headers['x-request-id']).toBe('mi-id-123')
    servidor.close()
  })

  it('un servicio inalcanzable (502) se registra con el error de conexion', async () => {
    const antes = loki.envios.length
    const { servidor, logs } = nuevoRouter({ puertoStable: 1 })
    const puerto = await levantar(servidor)

    const r = await pedir(puerto)
    await logs.vaciar()
    await esperar(() => loki.envios.length > antes)

    expect(r.status).toBe(502)
    const flujo = loki.envios.at(-1).cuerpo.streams[0]
    expect(flujo.stream).toMatchObject({ level: 'error', track: 'stable', version: 'desconocida' })
    expect(JSON.parse(flujo.values[0][1])).toMatchObject({ status: 502 })
    servidor.close()
  })
})
