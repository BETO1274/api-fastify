// Visor de trafico en vivo: reparto, errores y latencia por track, leidos
// de /router/metrics cada pocos segundos. Sirve para ver el canary en la
// demostracion sin depender del tablero de Grafana.
//
//   node trafico.mjs --router URL [--intervalo 5]
import { pathToFileURL } from 'node:url'
import { parsearMetricas, percentil, resumir, restar } from './gate.mjs'

export function pesoActual(muestras) {
  return muestras.find((m) => m.nombre === 'router_canary_weight')?.valor ?? null
}

// Calcula la linea de cada track a partir de la diferencia entre dos lecturas.
export function lineaTrack(delta, totalPeticiones, segundos) {
  const peticiones = delta?.total ?? 0
  const p95 = delta ? percentil(delta.buckets, 0.95) : null
  return {
    peticiones,
    reqs_por_seg: segundos > 0 ? peticiones / segundos : 0,
    porcentaje: totalPeticiones > 0 ? (peticiones / totalPeticiones) * 100 : 0,
    errores_5xx: delta?.errores5xx ?? 0,
    tasa_error: peticiones > 0 ? (delta.errores5xx / peticiones) * 100 : 0,
    p95_ms: p95 === null ? null : p95 * 1000
  }
}

const dormir = (ms) => new Promise((resolver) => setTimeout(resolver, ms))
const col = (texto, ancho) => String(texto).padEnd(ancho)

async function leer(router) {
  const respuesta = await fetch(`${router.replace(/\/$/, '')}/router/metrics`, { signal: AbortSignal.timeout(15000) })
  const muestras = parsearMetricas(await respuesta.text())
  return { muestras, resumen: resumir(muestras) }
}

async function main() {
  const args = {}
  const lista = process.argv.slice(2)
  for (let i = 0; i < lista.length; i++) if (lista[i].startsWith('--')) args[lista[i].slice(2)] = lista[i + 1]
  if (!args.router) {
    console.error('Uso: trafico.mjs --router URL [--intervalo 5]')
    process.exit(1)
  }
  const segundos = Number(args.intervalo ?? 5)

  let anterior = await leer(args.router)
  console.log(`Observando ${args.router} cada ${segundos}s (Ctrl+C para salir)\n`)
  console.log(col('hora', 10) + col('peso canary', 13) + col('track', 8) + col('peticiones', 12) + col('req/s', 8) + col('% del total', 13) + col('5xx', 6) + col('error %', 9) + 'p95')
  for (;;) {
    await dormir(segundos * 1000)
    const actual = await leer(args.router).catch(() => null)
    if (!actual) {
      console.log('(sin respuesta del router)')
      continue
    }
    const delta = restar(actual.resumen, anterior.resumen)
    const total = (delta.stable?.total ?? 0) + (delta.canary?.total ?? 0)
    const hora = new Date().toLocaleTimeString('es-CO', { hour12: false })
    for (const track of ['stable', 'canary']) {
      const l = lineaTrack(delta[track], total, segundos)
      console.log(
        col(track === 'stable' ? hora : '', 10) +
        col(track === 'stable' ? `${pesoActual(actual.muestras)}%` : '', 13) +
        col(track, 8) + col(l.peticiones, 12) + col(l.reqs_por_seg.toFixed(1), 8) +
        col(`${l.porcentaje.toFixed(0)}%`, 13) + col(l.errores_5xx, 6) + col(`${l.tasa_error.toFixed(1)}%`, 9) +
        (l.p95_ms === null ? '-' : `${l.p95_ms.toFixed(0)}ms`)
      )
    }
    anterior = actual
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}
