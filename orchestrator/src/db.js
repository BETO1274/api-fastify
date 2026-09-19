import pg from 'pg'

const { Pool } = pg

let pool = null

export function obtenerPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Falla rápido si la base de datos no responde, en vez de colgarse.
      connectionTimeoutMillis: 5000
    })
  }
  return pool
}

export async function cerrarPool() {
  if (pool) {
    await pool.end()
    pool = null
  }
}
