import { existsSync } from 'node:fs'
import { crearRouter } from './router.js'

if (existsSync('.env')) {
  process.loadEnvFile('.env')
}

const { STABLE_URL, CANARY_URL } = process.env
if (!STABLE_URL || !CANARY_URL) {
  console.error('Faltan STABLE_URL y/o CANARY_URL')
  process.exit(1)
}

const { servidor } = crearRouter({
  stableUrl: STABLE_URL,
  canaryUrl: CANARY_URL,
  pesoInicial: Number(process.env.CANARY_WEIGHT || 0),
  adminKey: process.env.ADMIN_KEY || ''
})

const PORT = process.env.PORT || 8080
servidor.listen(PORT, '0.0.0.0', () => {
  console.log(`Router escuchando en ${PORT} (canary ${process.env.CANARY_WEIGHT || 0}%)`)
})
