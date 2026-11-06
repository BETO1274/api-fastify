import http from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { crearRouter } from '../src/router.js'

function levantar(servidor) {
  return new Promise((resolver) => {
    servidor.listen(0, '127.0.0.1', () => resolver(servidor.address().port))
  })
}

function falso(track) {
  return http.createServer((req, res) => {
    const partes = []
    req.on('data', (parte) => partes.push(parte))
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json', 'x-track': track })
      res.end(JSON.stringify({ track, metodo: req.method, cuerpo: Buffer.concat(partes).toString() }))
    })
  })
}

function pedir(puerto, { metodo = 'GET', ruta = '/articulos', headers = {}, cuerpo } = {}) {
  return new Promise((resolver, rechazar) => {
    const req = http.request({ host: '127.0.0.1', port: puerto, path: ruta, method: metodo, headers }, (res) => {
      const partes = []
      res.on('data', (parte) => partes.push(parte))
      res.on('end', () => resolver({ status: res.statusCode, headers: res.headers, texto: Buffer.concat(partes).toString() }))
    })
    req.on('error', rechazar)
    if (cuerpo) req.write(cuerpo)
    req.end()
  })
}

const ADMIN = 'clave-admin'
let stable, canary, puertoStable, puertoCanary
let secuencia = 0

// Aleatorio determinista: recorre 0.00, 0.01 ... 0.99 de forma cíclica, de
// modo que con peso N exactamente N de cada 100 peticiones caen en canary.
const aleatorioDeterminista = () => (secuencia++ % 100) / 100

async function nuevoRouter(opciones) {
  secuencia = 0
  const { servidor, estado } = crearRouter({
    stableUrl: `http://127.0.0.1:${puertoStable}`,
    canaryUrl: `http://127.0.0.1:${puertoCanary}`,
    adminKey: ADMIN,
    random: aleatorioDeterminista,
    ...opciones
  })
  const puerto = await levantar(servidor)
  return { servidor, estado, puerto }
}

beforeAll(async () => {
  stable = falso('stable')
  canary = falso('canary')
  puertoStable = await levantar(stable)
  puertoCanary = await levantar(canary)
})

afterAll(() => {
  stable.close()
  canary.close()
})

describe('router de canary', () => {
  it('con peso 0 todo el trafico publico va a stable', async () => {
    const { servidor, puerto } = await nuevoRouter({ pesoInicial: 0 })
    for (let i = 0; i < 20; i++) {
      const r = await pedir(puerto)
      expect(r.headers['x-routed-to']).toBe('stable')
    }
    servidor.close()
  })

  it('con peso 0, x-canary: true llega a canary (etapa 0)', async () => {
    const { servidor, puerto } = await nuevoRouter({ pesoInicial: 0 })
    const r = await pedir(puerto, { headers: { 'x-canary': 'true' } })

    expect(r.headers['x-routed-to']).toBe('canary')
    expect(r.headers['x-route-reason']).toBe('header')
    expect(JSON.parse(r.texto).track).toBe('canary')
    servidor.close()
  })

  it('con peso 20, exactamente 20 de 100 peticiones van a canary', async () => {
    const { servidor, puerto } = await nuevoRouter({ pesoInicial: 20 })
    let aCanary = 0
    for (let i = 0; i < 100; i++) {
      const r = await pedir(puerto)
      if (r.headers['x-routed-to'] === 'canary') aCanary++
    }

    expect(aCanary).toBe(20)
    servidor.close()
  })

  it('con peso 100 todo va a canary', async () => {
    const { servidor, puerto } = await nuevoRouter({ pesoInicial: 100 })
    for (let i = 0; i < 10; i++) {
      const r = await pedir(puerto)
      expect(r.headers['x-routed-to']).toBe('canary')
    }
    servidor.close()
  })

  it('la cookie sticky mantiene al cliente en el mismo track', async () => {
    const { servidor, puerto } = await nuevoRouter({ pesoInicial: 50 })
    const primera = await pedir(puerto)
    const cookie = primera.headers['set-cookie'][0].split(';')[0]

    for (let i = 0; i < 10; i++) {
      const r = await pedir(puerto, { headers: { cookie } })
      expect(r.headers['x-routed-to']).toBe(primera.headers['x-routed-to'])
      expect(r.headers['x-route-reason']).toBe('sticky')
    }
    servidor.close()
  })

  it('con peso 0 se ignora la cookie sticky (rollback inmediato)', async () => {
    const { servidor, puerto } = await nuevoRouter({ pesoInicial: 0 })
    const r = await pedir(puerto, { headers: { cookie: 'track=canary' } })

    expect(r.headers['x-routed-to']).toBe('stable')
    servidor.close()
  })

  it('reenvia cualquier verbo con su cuerpo, incluido QUERY', async () => {
    const { servidor, puerto } = await nuevoRouter({ pesoInicial: 0 })
    const r = await pedir(puerto, {
      metodo: 'QUERY',
      ruta: '/articulos/search',
      headers: { 'content-type': 'application/json' },
      cuerpo: JSON.stringify({ categoria: 'harinas' })
    })

    const datos = JSON.parse(r.texto)
    expect(datos.metodo).toBe('QUERY')
    expect(JSON.parse(datos.cuerpo)).toEqual({ categoria: 'harinas' })
    servidor.close()
  })

  it('POST /router/weight exige clave y cambia el peso en caliente', async () => {
    const { servidor, puerto } = await nuevoRouter({ pesoInicial: 0 })

    const sinClave = await pedir(puerto, { metodo: 'POST', ruta: '/router/weight', cuerpo: '{"canary_weight":100}' })
    expect(sinClave.status).toBe(401)

    const fuera = await pedir(puerto, {
      metodo: 'POST', ruta: '/router/weight', headers: { 'x-admin-key': ADMIN }, cuerpo: '{"canary_weight":150}'
    })
    expect(fuera.status).toBe(400)

    const ok = await pedir(puerto, {
      metodo: 'POST', ruta: '/router/weight', headers: { 'x-admin-key': ADMIN }, cuerpo: '{"canary_weight":100}'
    })
    expect(ok.status).toBe(200)

    const r = await pedir(puerto)
    expect(r.headers['x-routed-to']).toBe('canary')

    await pedir(puerto, {
      metodo: 'POST', ruta: '/router/weight', headers: { 'x-admin-key': ADMIN }, cuerpo: '{"canary_weight":0}'
    })
    const despues = await pedir(puerto)
    expect(despues.headers['x-routed-to']).toBe('stable')
    servidor.close()
  })

  it('GET /router/metrics expone peticiones y latencia por track', async () => {
    const { servidor, puerto } = await nuevoRouter({ pesoInicial: 0 })
    await pedir(puerto)
    await pedir(puerto, { headers: { 'x-canary': 'true' } })
    const r = await pedir(puerto, { ruta: '/router/metrics' })

    expect(r.status).toBe(200)
    expect(r.texto).toMatch(/router_requests_total\{track="stable"/)
    expect(r.texto).toMatch(/router_requests_total\{track="canary"/)
    expect(r.texto).toContain('router_request_duration_seconds_bucket')
    expect(r.texto).toContain('router_canary_weight 0')
    servidor.close()
  })

  it('responde 502 cuando el servicio destino no esta disponible', async () => {
    secuencia = 0
    const { servidor } = crearRouter({
      stableUrl: 'http://127.0.0.1:1',
      canaryUrl: `http://127.0.0.1:${puertoCanary}`,
      pesoInicial: 0,
      random: aleatorioDeterminista
    })
    const puerto = await levantar(servidor)
    const r = await pedir(puerto)

    expect(r.status).toBe(502)
    servidor.close()
  })
})
