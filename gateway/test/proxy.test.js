import { createServer } from 'node:http'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'

// Orquestador falso: registra cada petición que le llega y responde lo que la
// prueba le indique en `respuestaSimulada`.
let servidor
let recibidas = []
let respuestaSimulada = { status: 202, body: { id: 'tarea-1', estado: 'pendiente' } }

beforeAll(async () => {
  servidor = createServer((req, res) => {
    let texto = ''
    req.on('data', (trozo) => { texto += trozo })
    req.on('end', () => {
      recibidas.push({
        metodo: req.method,
        url: req.url,
        traceId: req.headers['x-trace-id'],
        apiKeyRecibida: req.headers['x-api-key'],
        body: texto ? JSON.parse(texto) : undefined
      })
      res.statusCode = respuestaSimulada.status
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(respuestaSimulada.body))
    })
  })
  await new Promise((resolver) => servidor.listen(0, resolver))
})

afterAll(async () => {
  await new Promise((resolver) => servidor.close(resolver))
})

afterEach(() => {
  recibidas = []
  respuestaSimulada = { status: 202, body: { id: 'tarea-1', estado: 'pendiente' } }
  delete process.env.TEAM_API_KEY
  process.env.ORQUESTADOR_URL = `http://127.0.0.1:${servidor.address().port}`
})

async function conApp(fn) {
  process.env.ORQUESTADOR_URL = `http://127.0.0.1:${servidor.address().port}`
  const app = buildApp()
  try {
    await fn(app)
  } finally {
    await app.close()
  }
}

describe('GET /health', () => {
  it('responde 200 sin pedir key aunque TEAM_API_KEY esté configurada', async () => {
    process.env.TEAM_API_KEY = 'clave-del-equipo'
    await conApp(async (app) => {
      const respuesta = await app.inject({ method: 'GET', url: '/health' })
      expect(respuesta.statusCode).toBe(200)
      expect(respuesta.json()).toEqual({ status: 'ok' })
    })
  })
})

describe('traducción a POST /orquestar', () => {
  it('convierte un GET con query string en la tarea correspondiente y devuelve lo que responde el orquestador', async () => {
    await conApp(async (app) => {
      const respuesta = await app.inject({ method: 'GET', url: '/api_fastify/articulos/1?x=2' })

      expect(respuesta.statusCode).toBe(202)
      expect(respuesta.json()).toEqual({ id: 'tarea-1', estado: 'pendiente' })

      expect(recibidas).toHaveLength(1)
      expect(recibidas[0].metodo).toBe('POST')
      expect(recibidas[0].url).toBe('/orquestar')
      expect(recibidas[0].body).toEqual({
        servicio: 'api_fastify',
        metodo: 'GET',
        ruta: '/articulos/1?x=2'
      })
    })
  })

  it('reenvía el body de un POST', async () => {
    await conApp(async (app) => {
      await app.inject({
        method: 'POST',
        url: '/inventario_u/movimientos',
        payload: { sku_id: 1, tipo: 'entrada', cantidad: 5 }
      })

      expect(recibidas[0].body).toEqual({
        servicio: 'inventario_u',
        metodo: 'POST',
        ruta: '/movimientos',
        body: { sku_id: 1, tipo: 'entrada', cantidad: 5 }
      })
    })
  })

  it('reenvía PATCH, PUT y DELETE con su método original', async () => {
    await conApp(async (app) => {
      await app.inject({ method: 'PATCH', url: '/api_fastify/articulos/1', payload: { nombre: 'x' } })
      await app.inject({ method: 'PUT', url: '/deportback/deportistas/abc', payload: { nombre: 'y' } })
      await app.inject({ method: 'DELETE', url: '/api_fastify/articulos/1' })

      expect(recibidas.map((r) => r.body.metodo)).toEqual(['PATCH', 'PUT', 'DELETE'])
      // Un DELETE no lleva body.
      expect(recibidas[2].body).not.toHaveProperty('body')
    })
  })

  it('reenvía QUERY con su body', async () => {
    await conApp(async (app) => {
      const respuesta = await app.inject({
        method: 'QUERY',
        url: '/api_fastify/articulos/search',
        payload: { tipo: 'materia_prima' }
      })

      expect(respuesta.statusCode).toBe(202)
      expect(recibidas[0].body).toEqual({
        servicio: 'api_fastify',
        metodo: 'QUERY',
        ruta: '/articulos/search',
        body: { tipo: 'materia_prima' }
      })
    })
  })

  it('devuelve tal cual un error del orquestador (por ejemplo 400)', async () => {
    respuestaSimulada = { status: 400, body: { mensaje: 'body inválido' } }
    await conApp(async (app) => {
      const respuesta = await app.inject({ method: 'GET', url: '/api_fastify/articulos' })
      expect(respuesta.statusCode).toBe(400)
      expect(respuesta.json()).toEqual({ mensaje: 'body inválido' })
    })
  })
})

describe('trace id', () => {
  it('genera un X-Trace-Id si no llega y lo manda al orquestador y al cliente', async () => {
    await conApp(async (app) => {
      const respuesta = await app.inject({ method: 'GET', url: '/api_fastify/articulos' })

      expect(respuesta.headers['x-trace-id']).toBeTruthy()
      expect(recibidas[0].traceId).toBe(respuesta.headers['x-trace-id'])
    })
  })

  it('conserva el X-Trace-Id que manda el cliente', async () => {
    await conApp(async (app) => {
      const respuesta = await app.inject({
        method: 'GET',
        url: '/api_fastify/articulos',
        headers: { 'x-trace-id': 'trace-del-cliente' }
      })

      expect(respuesta.headers['x-trace-id']).toBe('trace-del-cliente')
      expect(recibidas[0].traceId).toBe('trace-del-cliente')
    })
  })
})

describe('control de acceso', () => {
  it('responde 401 si TEAM_API_KEY está configurada y la key falta o es incorrecta', async () => {
    process.env.TEAM_API_KEY = 'clave-del-equipo'
    await conApp(async (app) => {
      const sinKey = await app.inject({ method: 'GET', url: '/api_fastify/articulos' })
      expect(sinKey.statusCode).toBe(401)

      const keyIncorrecta = await app.inject({
        method: 'GET',
        url: '/api_fastify/articulos',
        headers: { 'x-api-key': 'otra-clave!!!!!!' }
      })
      expect(keyIncorrecta.statusCode).toBe(401)

      // Ninguna de las dos llegó al orquestador.
      expect(recibidas).toHaveLength(0)
    })
  })

  it('deja pasar la petición con la key correcta', async () => {
    process.env.TEAM_API_KEY = 'clave-del-equipo'
    await conApp(async (app) => {
      const respuesta = await app.inject({
        method: 'GET',
        url: '/api_fastify/articulos',
        headers: { 'x-api-key': 'clave-del-equipo' }
      })

      expect(respuesta.statusCode).toBe(202)
      expect(recibidas).toHaveLength(1)
    })
  })

  it('reenvía la key al orquestador (segunda capa de defensa de su lado)', async () => {
    process.env.TEAM_API_KEY = 'clave-del-equipo'
    await conApp(async (app) => {
      await app.inject({
        method: 'GET',
        url: '/api_fastify/articulos',
        headers: { 'x-api-key': 'clave-del-equipo' }
      })

      expect(recibidas[0].apiKeyRecibida).toBe('clave-del-equipo')
    })
  })
})

describe('rutas no válidas', () => {
  it('responde 404 si el servicio no es uno de los 3 conocidos', async () => {
    await conApp(async (app) => {
      const respuesta = await app.inject({ method: 'GET', url: '/otro_servicio/articulos' })

      expect(respuesta.statusCode).toBe(404)
      expect(recibidas).toHaveLength(0)
    })
  })
})

describe('GET /orquestar/:id', () => {
  it('consulta el estado de la tarea en el orquestador', async () => {
    respuestaSimulada = { status: 200, body: { id: 'abc', estado: 'completado' } }
    await conApp(async (app) => {
      const respuesta = await app.inject({ method: 'GET', url: '/orquestar/abc' })

      expect(respuesta.statusCode).toBe(200)
      expect(respuesta.json().estado).toBe('completado')
      expect(recibidas[0].metodo).toBe('GET')
      expect(recibidas[0].url).toBe('/orquestar/abc')
    })
  })
})

describe('fallos del orquestador', () => {
  it('responde 502 si el orquestador no está disponible', async () => {
    await conApp(async (app) => {
      process.env.ORQUESTADOR_URL = 'http://127.0.0.1:1'
      const respuesta = await app.inject({ method: 'GET', url: '/api_fastify/articulos' })

      expect(respuesta.statusCode).toBe(502)
    })
  })

  it('responde 500 si ORQUESTADOR_URL no está configurada', async () => {
    const app = buildApp()
    delete process.env.ORQUESTADOR_URL
    const respuesta = await app.inject({ method: 'GET', url: '/api_fastify/articulos' })

    expect(respuesta.statusCode).toBe(500)
    await app.close()
  })
})
