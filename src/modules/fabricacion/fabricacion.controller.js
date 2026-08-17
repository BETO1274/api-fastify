import { pool } from '../../config/db.js'

async function descontarInsumo(client, articuloId, cantidadNecesaria) {
  const { rows } = await client.query(
    'select id from stock where articulo_id = $1 order by id limit 1 for update',
    [articuloId]
  )

  if (rows.length === 0) {
    await client.query(
      'insert into stock (articulo_id, cantidad, ubicacion) values ($1, $2, $3)',
      [articuloId, -cantidadNecesaria, 'Producción']
    )
    return
  }

  await client.query(
    'update stock set cantidad = cantidad - $1, actualizado_en = now() where id = $2',
    [cantidadNecesaria, rows[0].id]
  )
}

export async function crearFabricacion({ receta_id, cantidad_producir }) {
  const client = await pool.connect()
  try {
    await client.query('begin')

    const { rows: recetaRows } = await client.query('select * from receta where id = $1', [receta_id])
    const receta = recetaRows[0]
    if (!receta) {
      const error = new Error('Receta no encontrada')
      error.statusCode = 404
      throw error
    }

    const { rows: ingredientes } = await client.query(
      'select articulo_id, cantidad_necesaria from receta_ingrediente where receta_id = $1',
      [receta_id]
    )

    for (const ingrediente of ingredientes) {
      const cantidadRequerida = Number(ingrediente.cantidad_necesaria) * cantidad_producir
      await descontarInsumo(client, ingrediente.articulo_id, cantidadRequerida)
    }

    await client.query(
      'insert into stock (articulo_id, cantidad, ubicacion) values ($1, $2, $3)',
      [receta.producto_final_id, cantidad_producir, 'Producción']
    )

    const { rows: fabricacionRows } = await client.query(
      'insert into fabricacion (receta_id, cantidad_producir) values ($1, $2) returning *',
      [receta_id, cantidad_producir]
    )

    await client.query('commit')
    return fabricacionRows[0]
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export async function obtenerFabricacionPorId(id) {
  const { rows } = await pool.query('select * from fabricacion where id = $1', [id])
  return rows[0] ?? null
}

export async function actualizarFabricacion(id, cambios) {
  const campos = Object.keys(cambios)
  if (campos.length === 0) {
    return obtenerFabricacionPorId(id)
  }

  const asignaciones = campos.map((campo, indice) => `${campo} = $${indice + 1}`).join(', ')
  const valores = campos.map((campo) => cambios[campo])

  const { rows } = await pool.query(
    `update fabricacion
     set ${asignaciones}
     where id = $${campos.length + 1}
     returning *`,
    [...valores, id]
  )
  return rows[0] ?? null
}

export async function eliminarFabricacion(id) {
  const { rows } = await pool.query('delete from fabricacion where id = $1 returning id', [id])
  return rows[0] ?? null
}

export async function buscarFabricaciones({ receta_id }) {
  const condiciones = []
  const valores = []

  if (receta_id) {
    valores.push(receta_id)
    condiciones.push(`receta_id = $${valores.length}`)
  }

  const whereClause = condiciones.length > 0 ? `where ${condiciones.join(' and ')}` : ''
  const { rows } = await pool.query(
    `select * from fabricacion ${whereClause} order by id`,
    valores
  )
  return rows
}
