import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { activarLatencia, desactivarCaos, estadoCaos, latenciaVigente } from '../../src/common/caos-saliente.js'

const CLAVE = 'clave-del-equipo'

describe('caos saliente — lógica y vencimiento', () => {
  afterEach(() => desactivarCaos())

  it('inyecta la latencia solo al servicio indicado', () => {
    activarLatencia({ servicio: 'deportback', latenciaMs: 800, duracionS: 60 })

    expect(latenciaVigente('deportback')).toBe(800)
    expect(latenciaVigente('inventario_u')).toBe(0)
  })

  it('"todos" alcanza a las dos APIs externas', () => {
    activarLatencia({ servicio: 'todos', latenciaMs: 200, duracionS: 60 })

    expect(estadoCaos().map((e) => e.servicio)).toEqual(['deportback', 'inventario_u'])
  })

  it('vence solo al cumplirse la duración, sin que nadie lo apague', () => {
    const ahora = 1_000_000
    activarLatencia({ servicio: 'deportback', latenciaMs: 800, duracionS: 30 }, ahora)

    expect(latenciaVigente('deportback', ahora + 29_000)).toBe(800)
    expect(latenciaVigente('deportback', ahora + 30_000)).toBe(0)
    expect(estadoCaos(ahora + 31_000)).toEqual([])
  })

  it('rechaza activarlo sin duración, con duración excesiva, o con latencia o servicio inválidos', () => {
    expect(() => activarLatencia({ servicio: 'deportback', latenciaMs: 500 })).toThrow(/duracion_s/)
    expect(() => activarLatencia({ servicio: 'deportback', latenciaMs: 500, duracionS: 99999 })).toThrow(/duracion_s/)
    expect(() => activarLatencia({ servicio: 'deportback', latenciaMs: 99999, duracionS: 10 })).toThrow(/latencia_ms/)
    expect(() => activarLatencia({ servicio: 'otra_api', latenciaMs: 500, duracionS: 10 })).toThrow(/desconocido/)
  })
})

describe('caos saliente — controles administrativos', () => {
  afterEach(() => {
    desactivarCaos()
    delete process.env.CAOS_SALIENTE_HABILITADO
    delete process.env.TEAM_API_KEY
  })

  const cabeceras = { 'x-api-key': CLAVE, 'content-type': 'application/json' }
  const activar = (app, body) => app.inject({ method: 'POST', url: '/admin/caos-saliente', headers: cabeceras, payload: body })

  it('no existen si CAOS_SALIENTE_HABILITADO no está activado (404)', async () => {
    process.env.TEAM_API_KEY = CLAVE
    const app = buildApp()

    const respuesta = await app.inject({ method: 'GET', url: '/admin/caos-saliente', headers: cabeceras })

    expect(respuesta.statusCode).toBe(404)
    await app.close()
  })

  it('no se registran sin TEAM_API_KEY, aunque estén habilitados', async () => {
    process.env.CAOS_SALIENTE_HABILITADO = 'true'
    const app = buildApp()

    const respuesta = await app.inject({ method: 'GET', url: '/admin/caos-saliente' })

    expect(respuesta.statusCode).toBe(404)
    await app.close()
  })

  it('exigen la x-api-key (401) antes de validar el cuerpo', async () => {
    process.env.CAOS_SALIENTE_HABILITADO = 'true'
    process.env.TEAM_API_KEY = CLAVE
    const app = buildApp()

    const sinClave = await app.inject({ method: 'POST', url: '/admin/caos-saliente', payload: { servicio: 'todos', latencia_ms: 100, duracion_s: 10 } })
    const claveMala = await app.inject({ method: 'POST', url: '/admin/caos-saliente', headers: { 'x-api-key': 'otra' }, payload: {} })

    expect(sinClave.statusCode).toBe(401)
    expect(claveMala.statusCode).toBe(401) // cuerpo inválido, pero la clave se revisa primero
    expect(estadoCaos()).toEqual([])
    await app.close()
  })

  it('activan, consultan y desactivan; rechazan activaciones inválidas (400)', async () => {
    process.env.CAOS_SALIENTE_HABILITADO = 'true'
    process.env.TEAM_API_KEY = CLAVE
    const app = buildApp()

    expect((await activar(app, { servicio: 'deportback', latencia_ms: 500 })).statusCode).toBe(400)
    expect((await activar(app, { servicio: 'deportback', latencia_ms: 500, duracion_s: 99999 })).statusCode).toBe(400)
    expect((await activar(app, { servicio: 'otra_api', latencia_ms: 500, duracion_s: 60 })).statusCode).toBe(400)

    const ok = await activar(app, { servicio: 'deportback', latencia_ms: 500, duracion_s: 60 })
    expect(ok.statusCode).toBe(200)
    expect(ok.json().activos[0]).toMatchObject({ servicio: 'deportback', latencia_ms: 500, restante_s: 60 })

    const estado = await app.inject({ method: 'GET', url: '/admin/caos-saliente', headers: cabeceras })
    expect(estado.json().activos).toHaveLength(1)

    const apagado = await app.inject({ method: 'DELETE', url: '/admin/caos-saliente', headers: { 'x-api-key': CLAVE } })
    expect(apagado.json()).toEqual({ activos: [] })
    expect(latenciaVigente('deportback')).toBe(0)
    await app.close()
  })

  it('exponen la ventana de inyección en /metrics y la bajan a 0 al apagarla', async () => {
    process.env.CAOS_SALIENTE_HABILITADO = 'true'
    process.env.TEAM_API_KEY = CLAVE
    const app = buildApp()
    const activa = (texto, valor) => new RegExp(`caos_inyeccion_activa\\{[^}]*servicio="deportback"[^}]*\\} ${valor}`).test(texto)

    await activar(app, { servicio: 'deportback', latencia_ms: 500, duracion_s: 60 })
    expect(activa((await app.inject({ method: 'GET', url: '/metrics' })).body, 1)).toBe(true)

    desactivarCaos()
    expect(activa((await app.inject({ method: 'GET', url: '/metrics' })).body, 0)).toBe(true)
    await app.close()
  })
})
