import { pool } from '../../config/db.js'

export async function crearStock({ articulo_id, cantidad, ubicacion }) {
  const { rows } = await pool.query(
    `insert into stock (articulo_id, cantidad, ubicacion)
     values ($1, $2, $3)
     returning *`,
    [articulo_id, cantidad, ubicacion]
  )
  return rows[0]
}

export async function obtenerStockPorId(id) {
  const { rows } = await pool.query('select * from stock where id = $1', [id])
  return rows[0] ?? null
}
