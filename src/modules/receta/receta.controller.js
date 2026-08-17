import { pool } from '../../config/db.js'

export async function crearReceta({ producto_final_id, ingredientes }) {
  const client = await pool.connect()
  try {
    await client.query('begin')

    const { rows } = await client.query(
      'insert into receta (producto_final_id) values ($1) returning *',
      [producto_final_id]
    )
    const receta = rows[0]

    for (const ingrediente of ingredientes) {
      await client.query(
        `insert into receta_ingrediente (receta_id, articulo_id, cantidad_necesaria)
         values ($1, $2, $3)`,
        [receta.id, ingrediente.articulo_id, ingrediente.cantidad_necesaria]
      )
    }

    await client.query('commit')
    return { ...receta, ingredientes }
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export async function obtenerRecetaPorId(id) {
  const { rows } = await pool.query('select * from receta where id = $1', [id])
  const receta = rows[0]
  if (!receta) {
    return null
  }

  const { rows: ingredientes } = await pool.query(
    'select articulo_id, cantidad_necesaria from receta_ingrediente where receta_id = $1 order by id',
    [id]
  )

  return { ...receta, ingredientes }
}
