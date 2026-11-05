import { afterAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { pool } from '../../src/config/db.js'

process.env.TEAM_API_KEY = 'clave-de-prueba'
const cabeceras = { 'x-api-key': 'clave-de-prueba' }

process.env.APP_TRACK = 'stable'
const stable = buildApp()

process.env.APP_TRACK = 'canary'
const canary = buildApp()

afterAll(async () => {
  await stable.close()
  await canary.close()
  await pool.end()
})

describe('inyeccion de fallos (solo canary)', () => {
  it('stable no expone /admin/caos', async () => {
    const respuesta = await stable.inject({ method: 'GET', url: '/admin/caos', headers: cabeceras })

    expect(respuesta.statusCode).toBe(404)
  })

  it('canary exige x-api-key en /admin/caos', async () => {
    const respuesta = await canary.inject({ method: 'GET', url: '/admin/caos' })

    expect(respuesta.statusCode).toBe(401)
  })

  it('POST /admin/caos con valores fuera de rango responde 400', async () => {
    const respuesta = await canary.inject({
      method: 'POST',
      url: '/admin/caos',
      headers: cabeceras,
      payload: { tasa_error: 5 }
    })

    expect(respuesta.statusCode).toBe(400)
  })

  it('tasa_error=1 hace fallar con 500 y DELETE lo apaga', async () => {
    const activar = await canary.inject({
      method: 'POST',
      url: '/admin/caos',
      headers: cabeceras,
      payload: { tasa_error: 1 }
    })
    expect(activar.statusCode).toBe(200)

    const fallo = await canary.inject({ method: 'GET', url: '/ruta-cualquiera' })
    expect(fallo.statusCode).toBe(500)
    expect(fallo.json().mensaje).toMatch(/inyectado/)

    const salud = await canary.inject({ method: 'GET', url: '/health' })
    expect(salud.statusCode).toBe(200)

    await canary.inject({ method: 'DELETE', url: '/admin/caos', headers: cabeceras })
    const normal = await canary.inject({ method: 'GET', url: '/ruta-cualquiera' })
    expect(normal.statusCode).toBe(404)
  })

  it('el header x-chaos agrega latencia solo con la clave correcta', async () => {
    const sinClave = Date.now()
    await canary.inject({ method: 'GET', url: '/ruta-cualquiera', headers: { 'x-chaos': 'latency=300' } })
    expect(Date.now() - sinClave).toBeLessThan(250)

    const conClave = Date.now()
    await canary.inject({
      method: 'GET',
      url: '/ruta-cualquiera',
      headers: { ...cabeceras, 'x-chaos': 'latency=300' }
    })
    expect(Date.now() - conClave).toBeGreaterThanOrEqual(290)
  })
})
