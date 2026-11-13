import { createServer } from 'node:http'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../../src/app.js'
import { reiniciarCircuitos } from '../../src/common/circuit-breaker.js'
import { activarLatencia, desactivarCaos } from '../../src/common/caos-saliente.js'

// El v2 se prueba SIN base de datos: solo se sustituye la búsqueda del
// artículo propio; el resto (llamadas a las otras APIs, timeout, circuit
// breaker, degradación) es el código real.
vi.mock('../../src/modules/articulo/articulo.controller.js', async (importOriginal) => ({
  ...(await importOriginal()),
  obtenerArticuloPorId: async (id) => ({ id: Number(id), nombre: 'Harina de trigo' })
}))

const NOMBRES = ['deportback', 'inventario_u']
const servidores = {}
const recibidas = { deportback: [], inventario_u: [] }
const comportamiento = {}

const ok = (cuerpo) => ({ status: 200, cuerpo: JSON.stringify(cuerpo) })

beforeAll(async () => {
  for (const nombre of NOMBRES) {
    servidores[nombre] = createServer((req, res) => {
      recibidas[nombre].push({ traceId: req.headers['x-trace-id'], apiKey: req.headers['x-api-key'], url: req.url })
      const { status, cuerpo } = comportamiento[nombre]
      res.statusCode = status
      res.setHeader('content-type', 'application/json')
      res.end(cuerpo)
    })
    await new Promise((resolver) => servidores[nombre].listen(0, resolver))
  }
})

afterAll(async () => {
  for (const nombre of NOMBRES) {
    servidores[nombre].closeAllConnections()
    await new Promise((resolver) => servidores[nombre].close(resolver))
  }
})

beforeEach(() => {
  recibidas.deportback = []
  recibidas.inventario_u = []
  comportamiento.deportback = ok([{ id: 'd1', nombre: 'Deportista de prueba' }])
  comportamiento.inventario_u = ok([{ id: 1, codigo: 'SKU-1' }])
  process.env.DEPORTBACK_URL = `http://127.0.0.1:${servidores.deportback.address().port}`
  process.env.INVENTARIO_U_URL = `http://127.0.0.1:${servidores.inventario_u.address().port}`
})

afterEach(() => {
  reiniciarCircuitos()
  desactivarCaos()
  for (const clave of ['DEPORTBACK_URL', 'INVENTARIO_U_URL', 'TEAM_API_KEY', 'HTTP_EXTERNO_TIMEOUT_MS', 'CB_ACTIVO', 'CB_UMBRAL_FALLOS', 'CB_ENFRIAMIENTO_MS']) {
    delete process.env[clave]
  }
})

async function pedirV2(headers = {}) {
  const app = buildApp()
  try {
    return await app.inject({ method: 'GET', url: '/api/v2/articulos/1', headers })
  } finally {
    await app.close()
  }
}

describe('GET /api/v2/articulos/:id — flujo de las 3 APIs', () => {
  it('une las tres APIs en una respuesta y propaga el mismo X-Trace-Id y la clave a las otras dos', async () => {
    process.env.TEAM_API_KEY = 'clave-del-equipo'

    const respuesta = await pedirV2({ 'x-trace-id': 'traza-v2', 'x-api-key': 'clave-del-equipo' })
    const cuerpo = respuesta.json()

    expect(respuesta.statusCode).toBe(200)
    expect(respuesta.headers['x-trace-id']).toBe('traza-v2')
    expect(cuerpo.articulo.nombre).toBe('Harina de trigo')
    expect(cuerpo.apis_externas.deportback).toEqual({ id: 'd1', nombre: 'Deportista de prueba' })
    expect(cuerpo.apis_externas.inventario_u).toEqual({ id: 1, codigo: 'SKU-1' })
    for (const nombre of NOMBRES) {
      expect(recibidas[nombre][0]).toMatchObject({ traceId: 'traza-v2', apiKey: 'clave-del-equipo' })
    }
  })

  it('llama a los listados v1 de las otras APIs, nunca a sus /api/v2 (sin ciclos)', async () => {
    await pedirV2()

    expect(recibidas.deportback[0].url).toBe('/deportistas')
    expect(recibidas.inventario_u[0].url).toBe('/skus')
  })

  it('llama a las dos APIs en paralelo: la latencia es la mayor, no la suma', async () => {
    activarLatencia({ servicio: 'todos', latenciaMs: 300, duracionS: 60 })

    const inicio = Date.now()
    const respuesta = await pedirV2()
    const duracion = Date.now() - inicio

    expect(respuesta.json().apis_externas.deportback).toHaveProperty('nombre')
    expect(duracion).toBeGreaterThanOrEqual(290)
    expect(duracion).toBeLessThan(550) // en serie serían ~600 ms
  })
})

describe('GET /api/v2/articulos/:id — Ronda 0 (controles actuales, sin circuit breaker)', () => {
  it('degrada si deportBack falla, pero sigue llamándolo en cada petición', async () => {
    comportamiento.deportback = { status: 500, cuerpo: '{}' }

    let ultima
    for (let i = 0; i < 5; i++) ultima = await pedirV2()
    const cuerpo = ultima.json()

    expect(ultima.statusCode).toBe(200)
    expect(cuerpo.apis_externas.deportback.error).toContain('respuesta 500')
    expect(cuerpo.apis_externas.inventario_u).toHaveProperty('codigo')
    expect(recibidas.deportback).toHaveLength(5)
  })

  it('con latencia inyectada mayor al timeout, espera el timeout completo en cada petición', async () => {
    process.env.HTTP_EXTERNO_TIMEOUT_MS = '250'
    activarLatencia({ servicio: 'deportback', latenciaMs: 2000, duracionS: 60 })

    const tiempos = []
    for (let i = 0; i < 3; i++) {
      const inicio = Date.now()
      await pedirV2()
      tiempos.push(Date.now() - inicio)
    }

    for (const tiempo of tiempos) expect(tiempo).toBeGreaterThanOrEqual(240)
  })
})

describe('GET /api/v2/articulos/:id — Ronda 1 (con circuit breaker)', () => {
  beforeEach(() => {
    process.env.CB_ACTIVO = 'true'
    process.env.CB_UMBRAL_FALLOS = '2'
    process.env.HTTP_EXTERNO_TIMEOUT_MS = '250'
  })

  it('abre el circuito de deportBack, deja de llamarlo y la respuesta sigue completa en lo demás', async () => {
    comportamiento.deportback = { status: 500, cuerpo: '{}' }

    await pedirV2()
    await pedirV2()
    const cuerpo = (await pedirV2()).json()

    expect(cuerpo.apis_externas.deportback.error).toBe('circuito abierto para deportback')
    expect(cuerpo.apis_externas.inventario_u).toHaveProperty('codigo')
    expect(recibidas.deportback).toHaveLength(2)
    expect(recibidas.inventario_u).toHaveLength(3)
  })

  it('con latencia inyectada, tras abrirse el circuito la respuesta vuelve a ser rápida', async () => {
    activarLatencia({ servicio: 'deportback', latenciaMs: 2000, duracionS: 60 })

    await pedirV2()
    await pedirV2()
    const inicio = Date.now()
    const cuerpo = (await pedirV2()).json()
    const duracion = Date.now() - inicio

    expect(cuerpo.apis_externas.deportback.error).toBe('circuito abierto para deportback')
    expect(duracion).toBeLessThan(150)
  })
})
