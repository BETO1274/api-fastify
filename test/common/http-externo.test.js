import { createServer } from 'node:http'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { fetchConTimeout, leerConfigExterna } from '../../src/common/http-externo.js'
import { reiniciarCircuitos } from '../../src/common/circuit-breaker.js'
import { activarLatencia, desactivarCaos } from '../../src/common/caos-saliente.js'
import { registro } from '../../src/common/metricas.js'

// API externa falsa: registra lo que recibe y responde según `comportamiento`.
let servidor
let url
let recibidas
let comportamiento

beforeAll(async () => {
  servidor = createServer((req, res) => {
    recibidas.push({ traceId: req.headers['x-trace-id'], apiKey: req.headers['x-api-key'] })
    const { status, cuerpo, demoraMs } = comportamiento
    setTimeout(() => {
      res.statusCode = status
      res.setHeader('content-type', 'application/json')
      res.end(cuerpo)
    }, demoraMs ?? 0)
  })
  await new Promise((resolver) => servidor.listen(0, resolver))
  url = `http://127.0.0.1:${servidor.address().port}/deportistas`
})

afterAll(async () => {
  servidor.closeAllConnections()
  await new Promise((resolver) => servidor.close(resolver))
})

beforeEach(() => {
  recibidas = []
  comportamiento = { status: 200, cuerpo: JSON.stringify([{ id: 'd1' }]) }
})

afterEach(() => {
  reiniciarCircuitos()
  desactivarCaos()
  for (const clave of ['HTTP_EXTERNO_TIMEOUT_MS', 'CB_ACTIVO', 'CB_UMBRAL_FALLOS', 'CB_ENFRIAMIENTO_MS', 'TEAM_API_KEY']) {
    delete process.env[clave]
  }
})

const dormir = (ms) => new Promise((resolver) => setTimeout(resolver, ms))

describe('fetchConTimeout — comportamiento base (Ronda 0, sin circuit breaker)', () => {
  it('devuelve los datos y propaga el trace id y la clave del equipo', async () => {
    process.env.TEAM_API_KEY = 'clave-del-equipo'

    const resultado = await fetchConTimeout(url, { traceId: 'traza-1', servicio: 'deportback' })

    expect(resultado).toEqual({ ok: true, data: [{ id: 'd1' }] })
    expect(recibidas[0]).toEqual({ traceId: 'traza-1', apiKey: 'clave-del-equipo' })
  })

  it('degrada con un mensaje claro ante un 5xx y ante un 4xx', async () => {
    comportamiento = { status: 500, cuerpo: '{}' }
    expect(await fetchConTimeout(url, { servicio: 'deportback' })).toEqual({ ok: false, error: `respuesta 500 de ${url}` })

    comportamiento = { status: 404, cuerpo: '{}' }
    expect(await fetchConTimeout(url, { servicio: 'deportback' })).toEqual({ ok: false, error: `respuesta 404 de ${url}` })
  })

  it('corta la espera con el timeout indicado', async () => {
    comportamiento = { status: 200, cuerpo: '[]', demoraMs: 500 }

    const inicio = Date.now()
    const resultado = await fetchConTimeout(url, { timeoutMs: 100, servicio: 'deportback' })

    expect(resultado).toEqual({ ok: false, error: `tiempo de espera agotado (100ms) para ${url}` })
    expect(Date.now() - inicio).toBeLessThan(400)
  })

  it('usa HTTP_EXTERNO_TIMEOUT_MS cuando no se indica un timeout', async () => {
    process.env.HTTP_EXTERNO_TIMEOUT_MS = '80'
    comportamiento = { status: 200, cuerpo: '[]', demoraMs: 400 }

    const resultado = await fetchConTimeout(url, { servicio: 'deportback' })

    expect(resultado.error).toContain('(80ms)')
  })

  it('degrada si no puede conectar o si la respuesta no es JSON', async () => {
    const sinConexion = await fetchConTimeout('http://127.0.0.1:1/deportistas', { servicio: 'deportback' })
    expect(sinConexion.ok).toBe(false)

    comportamiento = { status: 200, cuerpo: 'no es json' }
    const invalida = await fetchConTimeout(url, { servicio: 'deportback' })
    expect(invalida.ok).toBe(false)
  })

  it('sin circuit breaker, sigue llamando a una API caída (comportamiento actual)', async () => {
    comportamiento = { status: 500, cuerpo: '{}' }

    for (let i = 0; i < 6; i++) await fetchConTimeout(url, { servicio: 'deportback' })

    expect(recibidas).toHaveLength(6)
  })
})

describe('fetchConTimeout — con circuit breaker (Ronda 1)', () => {
  beforeEach(() => {
    process.env.CB_ACTIVO = 'true'
    process.env.CB_UMBRAL_FALLOS = '2'
  })

  it('abre el circuito tras los fallos consecutivos y responde sin llamar a la API', async () => {
    comportamiento = { status: 500, cuerpo: '{}' }

    await fetchConTimeout(url, { servicio: 'deportback' })
    await fetchConTimeout(url, { servicio: 'deportback' })
    const rechazada = await fetchConTimeout(url, { servicio: 'deportback' })

    expect(rechazada).toEqual({ ok: false, error: 'circuito abierto para deportback' })
    expect(recibidas).toHaveLength(2)
  })

  it('el circuito de una dependencia no afecta a la otra', async () => {
    comportamiento = { status: 500, cuerpo: '{}' }
    await fetchConTimeout(url, { servicio: 'deportback' })
    await fetchConTimeout(url, { servicio: 'deportback' })

    comportamiento = { status: 200, cuerpo: '[]' }
    const otra = await fetchConTimeout(url, { servicio: 'inventario_u' })

    expect(otra.ok).toBe(true)
  })

  it('prueba de nuevo tras el enfriamiento y se recupera si la API volvió', async () => {
    process.env.CB_ENFRIAMIENTO_MS = '120'
    comportamiento = { status: 500, cuerpo: '{}' }
    await fetchConTimeout(url, { servicio: 'deportback' })
    await fetchConTimeout(url, { servicio: 'deportback' })

    comportamiento = { status: 200, cuerpo: '[]' }
    await dormir(160)
    const recuperada = await fetchConTimeout(url, { servicio: 'deportback' })

    expect(recuperada.ok).toBe(true)
  })

  it('un 404 no abre el circuito: la API sí respondió', async () => {
    comportamiento = { status: 404, cuerpo: '{}' }

    for (let i = 0; i < 5; i++) await fetchConTimeout(url, { servicio: 'deportback' })

    expect(recibidas).toHaveLength(5)
  })

  it('los timeouts también abren el circuito, y después responde de inmediato', async () => {
    comportamiento = { status: 200, cuerpo: '[]', demoraMs: 300 }
    await fetchConTimeout(url, { timeoutMs: 60, servicio: 'deportback' })
    await fetchConTimeout(url, { timeoutMs: 60, servicio: 'deportback' })

    const inicio = Date.now()
    const rechazada = await fetchConTimeout(url, { timeoutMs: 60, servicio: 'deportback' })

    expect(rechazada.error).toBe('circuito abierto para deportback')
    expect(Date.now() - inicio).toBeLessThan(40)
  })
})

describe('fetchConTimeout — latencia inyectada por el interruptor de caos', () => {
  it('la latencia superior al timeout se vuelve un timeout, solo en la dependencia afectada', async () => {
    activarLatencia({ servicio: 'deportback', latenciaMs: 1000, duracionS: 60 })

    const inicio = Date.now()
    const afectada = await fetchConTimeout(url, { timeoutMs: 100, servicio: 'deportback' })
    const tiempo = Date.now() - inicio
    const noAfectada = await fetchConTimeout(url, { timeoutMs: 100, servicio: 'inventario_u' })

    expect(afectada.error).toContain('tiempo de espera agotado')
    expect(tiempo).toBeLessThan(500)
    expect(noAfectada.ok).toBe(true)
  })

  it('una latencia menor al timeout solo vuelve más lenta la llamada', async () => {
    activarLatencia({ servicio: 'deportback', latenciaMs: 200, duracionS: 60 })

    const inicio = Date.now()
    const resultado = await fetchConTimeout(url, { timeoutMs: 1000, servicio: 'deportback' })

    expect(resultado.ok).toBe(true)
    expect(Date.now() - inicio).toBeGreaterThanOrEqual(190)
  })
})

describe('fetchConTimeout — métricas y configuración', () => {
  it('registra las llamadas por servicio y resultado', async () => {
    await fetchConTimeout(url, { servicio: 'metrica_ok' })
    comportamiento = { status: 500, cuerpo: '{}' }
    await fetchConTimeout(url, { servicio: 'metrica_ok' })

    const texto = await registro.metrics()
    expect(texto).toMatch(/dependencia_llamadas_total\{[^}]*servicio="metrica_ok"[^}]*resultado="ok"[^}]*\} 1/)
    expect(texto).toMatch(/dependencia_llamadas_total\{[^}]*servicio="metrica_ok"[^}]*resultado="http_5xx"[^}]*\} 1/)
    expect(texto).toContain('dependencia_duracion_segundos_bucket')
  })

  it('usa valores por defecto que dejan el comportamiento como antes', () => {
    expect(leerConfigExterna({})).toEqual({ timeoutMs: 5000, circuitoActivo: false, umbralFallos: 3, enfriamientoMs: 30000 })
  })

  it('ignora valores inválidos de la configuración', () => {
    const config = leerConfigExterna({ HTTP_EXTERNO_TIMEOUT_MS: 'abc', CB_UMBRAL_FALLOS: '-2', CB_ACTIVO: 'si' })

    expect(config).toMatchObject({ timeoutMs: 5000, umbralFallos: 3, circuitoActivo: false })
  })
})
