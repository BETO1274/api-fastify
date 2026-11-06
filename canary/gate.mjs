// Quality gate del canary.
//
//   node gate.mjs snapshot --router URL --salida estado.json
//   node gate.mjs evaluar  --router URL --antes estado.json --etapa 1 [--slo slo.json]
//
// `snapshot` guarda los contadores del router al inicio de la etapa y
// `evaluar` calcula, con la diferencia, errores y percentiles de cada track.
// Codigos de salida de `evaluar`: 0 = promover, 10 = pausar, 20 = abortar.
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const SALIDA = { promover: 0, pausar: 10, abortar: 20 }

// Parseo minimo del formato de texto de Prometheus.
export function parsearMetricas(texto) {
  const muestras = []
  for (const linea of texto.split('\n')) {
    if (!linea || linea.startsWith('#')) continue
    const m = linea.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{(.*)\})?\s+(\S+)/)
    if (!m) continue
    const etiquetas = {}
    for (const par of (m[2] ?? '').matchAll(/(\w+)="((?:[^"\\]|\\.)*)"/g)) {
      etiquetas[par[1]] = par[2]
    }
    muestras.push({ nombre: m[1], etiquetas, valor: Number(m[3]) })
  }
  return muestras
}

// Resume los contadores del router por track. Las peticiones con
// reason="header" (pruebas de humo de la etapa 0) no cuentan: no son el
// trafico real que se reparte entre las versiones.
export function resumir(muestras) {
  const tracks = {}
  const obtener = (track) => (tracks[track] ??= { total: 0, errores5xx: 0, buckets: {} })

  for (const { nombre, etiquetas, valor } of muestras) {
    if (nombre === 'router_requests_total' && etiquetas.reason !== 'header') {
      const t = obtener(etiquetas.track)
      t.total += valor
      if (etiquetas.status_class === '5xx') t.errores5xx += valor
    }
    if (nombre === 'router_request_duration_seconds_bucket') {
      const t = obtener(etiquetas.track)
      const limite = etiquetas.le === '+Inf' ? Infinity : Number(etiquetas.le)
      t.buckets[limite] = (t.buckets[limite] ?? 0) + valor
    }
  }
  return tracks
}

function restar(despues, antes) {
  const resultado = {}
  for (const track of new Set([...Object.keys(despues), ...Object.keys(antes)])) {
    const d = despues[track] ?? { total: 0, errores5xx: 0, buckets: {} }
    const a = antes[track] ?? { total: 0, errores5xx: 0, buckets: {} }
    const buckets = {}
    for (const limite of Object.keys(d.buckets)) {
      buckets[limite] = d.buckets[limite] - (a.buckets[limite] ?? 0)
    }
    resultado[track] = { total: d.total - a.total, errores5xx: d.errores5xx - a.errores5xx, buckets }
  }
  return resultado
}

// Equivalente a histogram_quantile de Prometheus (interpolacion lineal).
export function percentil(buckets, q) {
  const pares = Object.entries(buckets)
    .map(([limite, cuenta]) => [Number(limite), cuenta])
    .sort((x, y) => x[0] - y[0])
  const total = pares.length ? pares[pares.length - 1][1] : 0
  if (total <= 0) return null

  const objetivo = q * total
  let limiteAnterior = 0
  let cuentaAnterior = 0
  for (const [limite, cuenta] of pares) {
    if (cuenta >= objetivo) {
      if (limite === Infinity) return limiteAnterior
      const rango = cuenta - cuentaAnterior
      if (rango === 0) return limite
      return limiteAnterior + (limite - limiteAnterior) * ((objetivo - cuentaAnterior) / rango)
    }
    limiteAnterior = limite === Infinity ? limiteAnterior : limite
    cuentaAnterior = cuenta
  }
  return limiteAnterior
}

function resumenTrack(datos) {
  const tasaError = datos.total > 0 ? datos.errores5xx / datos.total : 0
  const p95 = percentil(datos.buckets, 0.95)
  const p99 = percentil(datos.buckets, 0.99)
  return {
    peticiones: datos.total,
    errores_5xx: datos.errores5xx,
    tasa_error: tasaError,
    p95_ms: p95 === null ? null : p95 * 1000,
    p99_ms: p99 === null ? null : p99 * 1000
  }
}

// Decision pura: recibe los contadores de la etapa ya restados.
export function decidir(delta, slo, etapa) {
  const umbrales = slo.umbrales
  const minimo = slo.etapas[etapa].min_peticiones_canary
  const canary = resumenTrack(delta.canary ?? { total: 0, errores5xx: 0, buckets: {} })
  const stable = resumenTrack(delta.stable ?? { total: 0, errores5xx: 0, buckets: {} })
  const violaciones = []

  if (canary.peticiones >= umbrales.min_peticiones_abortar) {
    if (canary.tasa_error > umbrales.tasa_error_max) {
      violaciones.push(`tasa de errores del canary ${pct(canary.tasa_error)} > ${pct(umbrales.tasa_error_max)}`)
    }
    if (canary.tasa_error - stable.tasa_error > umbrales.tasa_error_delta_max) {
      violaciones.push(`errores del canary superan a stable por ${pct(canary.tasa_error - stable.tasa_error)} (max ${pct(umbrales.tasa_error_delta_max)})`)
    }
    for (const [clave, ratio, margen] of [
      ['p95_ms', umbrales.p95_ratio_max, umbrales.p95_margen_ms],
      ['p99_ms', umbrales.p99_ratio_max, umbrales.p99_margen_ms]
    ]) {
      if (canary[clave] !== null && stable[clave] !== null) {
        const limite = Math.max(stable[clave] * ratio, stable[clave] + margen)
        if (canary[clave] > limite) {
          violaciones.push(`${clave} del canary ${canary[clave].toFixed(0)}ms > limite ${limite.toFixed(0)}ms (stable ${stable[clave].toFixed(0)}ms)`)
        }
      }
    }
  }

  let decision = 'promover'
  let motivo = 'Todos los umbrales se cumplen con muestra suficiente'
  if (violaciones.length > 0) {
    decision = 'abortar'
    motivo = violaciones.join('; ')
  } else if (canary.peticiones < minimo) {
    decision = 'pausar'
    motivo = `Muestra insuficiente: ${canary.peticiones} de ${minimo} peticiones al canary`
  }

  return { decision, motivo, etapa: Number(etapa), canary, stable, minimo_peticiones: minimo }
}

const pct = (valor) => `${(valor * 100).toFixed(2)}%`

async function leerMetricas(router) {
  const respuesta = await fetch(`${router.replace(/\/$/, '')}/router/metrics`, { signal: AbortSignal.timeout(15000) })
  if (!respuesta.ok) throw new Error(`/router/metrics respondio ${respuesta.status}`)
  return resumir(parsearMetricas(await respuesta.text()))
}

function argumentos(lista) {
  const resultado = {}
  for (let i = 0; i < lista.length; i++) {
    if (lista[i].startsWith('--')) resultado[lista[i].slice(2)] = lista[i + 1]
  }
  return resultado
}

async function main() {
  const [comando, ...resto] = process.argv.slice(2)
  const args = argumentos(resto)

  if (comando === 'snapshot') {
    writeFileSync(args.salida, JSON.stringify(await leerMetricas(args.router)))
    console.log(`Snapshot guardado en ${args.salida}`)
    return
  }

  if (comando === 'evaluar') {
    const slo = JSON.parse(readFileSync(args.slo ?? new URL('./slo.json', import.meta.url), 'utf8'))
    const antes = JSON.parse(readFileSync(args.antes, 'utf8'))
    const resultado = decidir(restar(await leerMetricas(args.router), antes), slo, args.etapa)
    console.log(JSON.stringify(resultado, null, 2))
    process.exit(SALIDA[resultado.decision])
  }

  console.error('Uso: gate.mjs snapshot|evaluar --router URL ...')
  process.exit(1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}

export { restar }
