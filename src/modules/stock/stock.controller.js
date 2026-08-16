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

export async function actualizarStock(id, cambios) {
  const campos = Object.keys(cambios)
  if (campos.length === 0) {
    return obtenerStockPorId(id)
  }

  const asignaciones = campos.map((campo, indice) => `${campo} = $${indice + 1}`).join(', ')
  const valores = campos.map((campo) => cambios[campo])

  const { rows } = await pool.query(
    `update stock
     set ${asignaciones}, actualizado_en = now()
     where id = $${campos.length + 1}
     returning *`,
    [...valores, id]
  )
  return rows[0] ?? null
}
