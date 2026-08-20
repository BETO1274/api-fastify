

export async function obtenerArticuloPorId(id) {
  const { rows } = await pool.query('select * from articulo where id = $1', [id])
  return rows[0] ?? null
}

export async function actualizarArticulo(id, cambios) {
  const campos = Object.keys(cambios)
  if (campos.length === 0) {
    return obtenerArticuloPorId(id)
  }

  const asignaciones = campos.map((campo, indice) => `${campo} = $${indice + 1}`).join(', ')
  const valores = campos.map((campo) => cambios[campo])

  const { rows } = await pool.query(
    `update articulo
     set ${asignaciones}, actualizado_en = now()
     where id = $${campos.length + 1}
     returning *`,
    [...valores, id]
  )
  return rows[0] ?? null
}

export async function eliminarArticulo(id) {
  const { rows } = await pool.query('delete from articulo where id = $1 returning id', [id])
  return rows[0] ?? null
}

export async function buscarArticulos({ nombre, tipo, unidad_medida }) {
  const condiciones = []
  const valores = []

  if (nombre) {
    valores.push(`%${nombre}%`)
    condiciones.push(`nombre ilike $${valores.length}`)
  }
  if (tipo) {
    valores.push(tipo)
    condiciones.push(`tipo = $${valores.length}`)
  }
  if (unidad_medida) {
    valores.push(unidad_medida)
    condiciones.push(`unidad_medida = $${valores.length}`)
  }

  const whereClause = condiciones.length > 0 ? `where ${condiciones.join(' and ')}` : ''
  const { rows } = await pool.query(
    `select * from articulo ${whereClause} order by id`,
    valores
  )
  return rows
}
