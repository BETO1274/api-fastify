import pg from 'pg'

const { Pool } = pg

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Si la base de datos no responde (detenida, caída, red lenta), falla
  // rápido en vez de dejar la petición colgada indefinidamente.
  connectionTimeoutMillis: 5000
})
