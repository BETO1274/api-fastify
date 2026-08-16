import { readFileSync } from 'node:fs'

const umbral = Number(process.argv[2])

if (Number.isNaN(umbral)) {
  console.error('Uso: node scripts/check-coverage.mjs <umbral-minimo>')
  process.exit(1)
}

const resumen = JSON.parse(readFileSync('coverage/coverage-summary.json', 'utf8'))
const porcentajeLineas = resumen.total.lines.pct

console.log(`Cobertura de líneas: ${porcentajeLineas}% (mínimo requerido: ${umbral}%)`)

if (porcentajeLineas < umbral) {
  console.error(`❌ Quality gate no superado: ${porcentajeLineas}% < ${umbral}%`)
  process.exit(1)
}

console.log('✅ Quality gate de cobertura superado')
