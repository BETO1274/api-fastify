import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const slo = JSON.parse(readFileSync(new URL('../slo.json', import.meta.url), 'utf8'))
const etapas = Object.entries(slo.etapas)

describe('slo.json: plan de etapas', () => {
  it('define las etapas 10, 25, 50, 75 y 100 %, en ese orden', () => {
    expect(etapas.map(([, e]) => e.peso)).toEqual([10, 25, 50, 75, 100])
  })

  it('numera las etapas de forma consecutiva desde 1', () => {
    expect(etapas.map(([clave]) => clave)).toEqual(['1', '2', '3', '4', '5'])
  })

  it('el peso nunca baja de una etapa a la siguiente y termina en 100', () => {
    const pesos = etapas.map(([, e]) => e.peso)
    expect([...pesos].sort((a, b) => a - b)).toEqual(pesos)
    expect(pesos.at(-1)).toBe(100)
  })

  it('cada etapa tiene bake time y un minimo de peticiones razonable', () => {
    for (const [, etapa] of etapas) {
      expect(etapa.bake_minutos).toBeGreaterThan(0)
      expect(etapa.min_peticiones_canary).toBeGreaterThanOrEqual(slo.umbrales.min_peticiones_abortar)
    }
  })

  it('la demo tiene un tiempo de bake para cada etapa', () => {
    expect(Object.keys(slo.demo.bake_segundos)).toEqual(Object.keys(slo.etapas))
    for (const segundos of Object.values(slo.demo.bake_segundos)) {
      expect(segundos).toBeGreaterThan(0)
    }
  })
})
