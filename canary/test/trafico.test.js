import { describe, expect, it } from 'vitest'
import { parsearMetricas } from '../gate.mjs'
import { lineaTrack, pesoActual } from '../trafico.mjs'

describe('visor de trafico', () => {
  it('lee el peso actual del router', () => {
    const muestras = parsearMetricas('router_canary_weight 30\nrouter_requests_total{track="stable",reason="ponderado",status_class="2xx"} 5')

    expect(pesoActual(muestras)).toBe(30)
  })

  it('devuelve null si no existe la metrica del peso', () => {
    expect(pesoActual([])).toBeNull()
  })

  it('calcula reparto, tasa de error y req/s de un track', () => {
    const delta = { total: 20, errores5xx: 5, buckets: { 0.1: 15, 1: 20, [Infinity]: 20 } }

    const linea = lineaTrack(delta, 100, 5)

    expect(linea.peticiones).toBe(20)
    expect(linea.reqs_por_seg).toBe(4)
    expect(linea.porcentaje).toBe(20)
    expect(linea.tasa_error).toBe(25)
    expect(linea.p95_ms).toBeGreaterThan(100)
  })

  it('un track sin trafico da ceros y sin p95', () => {
    const linea = lineaTrack(undefined, 100, 5)

    expect(linea.peticiones).toBe(0)
    expect(linea.p95_ms).toBeNull()
  })
})
