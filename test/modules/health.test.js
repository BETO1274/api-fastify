import { afterAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { pool } from '../../src/config/db.js'

const app = buildApp()

afterAll(async () => {
  await app.close()
  await pool.end()
})

describe('health check', () => {
  it('GET /health responde 200 sin tocar la base de datos', async () => {
    const respuesta = await app.inject({ method: 'GET', url: '/health' })

    expect(respuesta.statusCode).toBe(200)
    expect(respuesta.json()).toEqual({ status: 'ok' })
  })

  it('responde X-App-Version y X-Track en cada respuesta', async () => {
    const respuesta = await app.inject({ method: 'GET', url: '/health' })

    expect(respuesta.headers['x-app-version']).toBeDefined()
    expect(['stable', 'canary']).toContain(respuesta.headers['x-track'])
  })
})
