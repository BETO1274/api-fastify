// Aplica db/schema.sql a la base de datos indicada en DATABASE_URL.
// Es idempotente (usa "create ... if not exists"), se puede correr varias veces.
//
//   npm run db:init
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import pg from 'pg'

if (!process.env.DATABASE_URL) {
  console.error('Falta DATABASE_URL como variable de entorno.')
  process.exit(1)
}

const carpeta = path.dirname(fileURLToPath(import.meta.url))
const sql = readFileSync(path.join(carpeta, '..', 'db', 'schema.sql'), 'utf8')

const cliente = new pg.Client({ connectionString: process.env.DATABASE_URL })
await cliente.connect()
await cliente.query(sql)
await cliente.end()

console.log('Esquema aplicado: tabla orquestador_tarea lista.')
