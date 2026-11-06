import { describe, expect, it } from 'vitest'
import { crearLogs } from '../src/logs.js'

// fetch falso: guarda lo que el cliente de logs enviaria a Loki.
function loki({ ok = true, falla = false } = {}) {
  const envios = []
  const fetchFn = async (url, opciones) => {
    if (falla) throw new Error('sin red')
    envios.push({ url, opciones, cuerpo: JSON.parse(opciones.body) })
    return { ok }
  }
  return { envios, fetchFn }
}

const conexion = { url: 'https://loki.prueba/loki/api/v1/push', user: '1799784', token: 'glc_secreto' }

describe('registro de logs hacia Loki', () => {
  it('queda desactivado y no envia nada si faltan las variables', async () => {
    const { envios, fetchFn } = loki()
    const logs = crearLogs({ fetchFn })

    logs.registrar('error', { track: 'canary', status: 500 })
    await logs.vaciar()

    expect(logs.activo).toBe(false)
    expect(envios).toHaveLength(0)
    expect(logs.estadisticas().pendientes).toBe(0)
  })

  it('envia con autenticacion basica y las etiquetas app, level, track y version', async () => {
    const { envios, fetchFn } = loki()
    const logs = crearLogs({ ...conexion, fetchFn })

    logs.registrar('error', { track: 'canary', version: '4.0.0', status: 500, path: '/articulos/1', error: 'Fallo inyectado' })
    await logs.vaciar()

    expect(envios).toHaveLength(1)
    const [envio] = envios
    expect(envio.opciones.headers.authorization).toBe(`Basic ${Buffer.from('1799784:glc_secreto').toString('base64')}`)
    const flujo = envio.cuerpo.streams[0]
    expect(flujo.stream).toEqual({ app: 'canary-router', level: 'error', track: 'canary', version: '4.0.0' })
    const linea = JSON.parse(flujo.values[0][1])
    expect(linea).toMatchObject({ status: 500, path: '/articulos/1', error: 'Fallo inyectado', track: 'canary', version: '4.0.0' })
    expect(flujo.values[0][0]).toMatch(/^\d{19}$/)
  })

  it('agrupa en flujos distintos por track y version, en un solo envio', async () => {
    const { envios, fetchFn } = loki()
    const logs = crearLogs({ ...conexion, fetchFn })

    logs.registrar('error', { track: 'canary', version: '4.0.0', status: 500 })
    logs.registrar('error', { track: 'canary', version: '4.0.0', status: 500 })
    logs.registrar('error', { track: 'stable', version: '3.0.1', status: 502 })
    await logs.vaciar()

    expect(envios).toHaveLength(1)
    const flujos = envios[0].cuerpo.streams
    expect(flujos).toHaveLength(2)
    const canary = flujos.find((f) => f.stream.track === 'canary')
    expect(canary.values).toHaveLength(2)
  })

  it('usa valores por defecto cuando no se conoce el track o la version', async () => {
    const { envios, fetchFn } = loki()
    const logs = crearLogs({ ...conexion, fetchFn })

    logs.registrar('error', { status: 502 })
    await logs.vaciar()

    expect(envios[0].cuerpo.streams[0].stream).toMatchObject({ track: 'desconocido', version: 'desconocida' })
  })

  it('envia solo cuando pasa el intervalo, sin tener que vaciar a mano', async () => {
    const { envios, fetchFn } = loki()
    const logs = crearLogs({ ...conexion, fetchFn, intervaloMs: 30 })

    logs.registrar('error', { track: 'canary', status: 500 })
    await new Promise((resolver) => setTimeout(resolver, 150))

    expect(envios).toHaveLength(1)
  })

  it('un fallo de Loki no lanza errores y se cuenta como fallido', async () => {
    const { fetchFn } = loki({ falla: true })
    const logs = crearLogs({ ...conexion, fetchFn })

    logs.registrar('error', { track: 'canary', status: 500 })
    await expect(logs.vaciar()).resolves.toBeUndefined()

    expect(logs.estadisticas().fallidos).toBe(1)
  })

  it('descarta entradas si se acumulan demasiadas pendientes', () => {
    const { fetchFn } = loki()
    const logs = crearLogs({ ...conexion, fetchFn, maxPendientes: 2, maxLote: 100, intervaloMs: 60000 })

    for (let i = 0; i < 5; i++) logs.registrar('error', { status: 500 })

    const { pendientes, descartados } = logs.estadisticas()
    expect(pendientes).toBe(2)
    expect(descartados).toBe(3)
  })
})
