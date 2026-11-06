import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { decidir, parsearMetricas, percentil, resumir, restar } from '../gate.mjs'

const slo = JSON.parse(readFileSync(new URL('../slo.json', import.meta.url), 'utf8'))

// Construye el delta de un track: `total` peticiones, `errores` 5xx y una
// distribucion de latencia con la mayoria de las peticiones en `rapido` segundos.
function track(total, errores, rapido, lento = rapido) {
  const limites = [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, Infinity]
  const buckets = {}
  const lentas = Math.round(total * 0.05)
  for (const limite of limites) {
    buckets[limite] = (limite >= rapido ? total - lentas : 0) + (limite >= lento ? lentas : 0)
  }
  return { total, errores5xx: errores, buckets }
}

describe('parsearMetricas y resumir', () => {
  const texto = [
    '# HELP router_requests_total x',
    'router_requests_total{track="stable",reason="ponderado",status_class="2xx"} 90',
    'router_requests_total{track="stable",reason="ponderado",status_class="5xx"} 1',
    'router_requests_total{track="canary",reason="ponderado",status_class="2xx"} 8',
    'router_requests_total{track="canary",reason="header",status_class="2xx"} 50',
    'router_request_duration_seconds_bucket{track="canary",le="0.1"} 6',
    'router_request_duration_seconds_bucket{track="canary",le="+Inf"} 8'
  ].join('\n')

  it('lee etiquetas y valores', () => {
    const muestras = parsearMetricas(texto)

    expect(muestras).toHaveLength(6)
    expect(muestras[0]).toEqual({
      nombre: 'router_requests_total',
      etiquetas: { track: 'stable', reason: 'ponderado', status_class: '2xx' },
      valor: 90
    })
  })

  it('suma por track y excluye el trafico de humo (reason=header)', () => {
    const resumen = resumir(parsearMetricas(texto))

    expect(resumen.stable.total).toBe(91)
    expect(resumen.stable.errores5xx).toBe(1)
    expect(resumen.canary.total).toBe(8)
    expect(resumen.canary.buckets[Infinity]).toBe(8)
  })

  it('restar calcula la diferencia entre dos fotos', () => {
    const antes = { canary: track(10, 0, 0.05) }
    const despues = { canary: track(110, 2, 0.05) }

    const delta = restar(despues, antes)

    expect(delta.canary.total).toBe(100)
    expect(delta.canary.errores5xx).toBe(2)
  })
})

describe('percentil', () => {
  it('interpola como histogram_quantile', () => {
    // 100 peticiones: 50 <= 0.1s, 100 <= 0.2s -> p75 queda a mitad del segundo bucket
    const p = percentil({ 0.1: 50, 0.2: 100, [Infinity]: 100 }, 0.75)

    expect(p).toBeCloseTo(0.15, 5)
  })

  it('devuelve null sin datos', () => {
    expect(percentil({ 0.1: 0, [Infinity]: 0 }, 0.95)).toBeNull()
  })
})

describe('decidir', () => {
  it('promueve cuando el canary es igual de sano que stable y hay muestra suficiente', () => {
    const r = decidir({ stable: track(900, 1, 0.05), canary: track(150, 1, 0.05) }, slo, 1)

    expect(r.decision).toBe('promover')
  })

  it('pausa cuando no hay peticiones suficientes al canary', () => {
    const r = decidir({ stable: track(900, 0, 0.05), canary: track(30, 0, 0.05) }, slo, 1)

    expect(r.decision).toBe('pausar')
    expect(r.motivo).toMatch(/Muestra insuficiente/)
  })

  it('aborta cuando la tasa de errores del canary supera el SLO', () => {
    const r = decidir({ stable: track(900, 1, 0.05), canary: track(150, 30, 0.05) }, slo, 1)

    expect(r.decision).toBe('abortar')
    expect(r.motivo).toMatch(/tasa de errores/)
  })

  it('aborta rapido con errores aunque la muestra aun no llegue al minimo de la etapa', () => {
    const r = decidir({ stable: track(900, 0, 0.05), canary: track(25, 25, 0.05) }, slo, 2)

    expect(r.decision).toBe('abortar')
  })

  it('no aborta por pocos datos: por debajo de min_peticiones_abortar solo pausa', () => {
    const r = decidir({ stable: track(900, 0, 0.05), canary: track(5, 5, 0.05) }, slo, 1)

    expect(r.decision).toBe('pausar')
  })

  it('aborta cuando el p95 del canary supera el limite relativo a stable', () => {
    const r = decidir({ stable: track(900, 0, 0.05), canary: track(200, 0, 1) }, slo, 1)

    expect(r.decision).toBe('abortar')
    expect(r.motivo).toMatch(/p95_ms/)
  })

  it('tolera pequenas diferencias de latencia dentro del margen', () => {
    const r = decidir({ stable: track(900, 0, 0.05), canary: track(200, 0, 0.1) }, slo, 1)

    expect(r.decision).toBe('promover')
  })
})
