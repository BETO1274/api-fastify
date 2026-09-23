import { obtenerPool } from './db.js'

const COLUMNAS = 'id, servicio, metodo, ruta, body, estado, resultado, creada_en, trace_id'

function aTarea(fila) {
  return {
    id: fila.id,
    servicio: fila.servicio,
    metodo: fila.metodo,
    ruta: fila.ruta,
    body: fila.body,
    estado: fila.estado,
    resultado: fila.resultado,
    creadaEn: fila.creada_en.toISOString(),
    traceId: fila.trace_id ?? undefined
  }
}

export async function crearTarea({ servicio, metodo, ruta, body, traceId }) {
  const { rows } = await obtenerPool().query(
    `insert into orquestador_tarea (id, servicio, metodo, ruta, body, trace_id)
     values ($1, $2, $3, $4, $5, $6)
     returning ${COLUMNAS}`,
    [crypto.randomUUID(), servicio, metodo, ruta, body === undefined ? null : JSON.stringify(body), traceId]
  )
  return aTarea(rows[0])
}

export async function obtenerTarea(id) {
  try {
    const { rows } = await obtenerPool().query(
      `select ${COLUMNAS} from orquestador_tarea where id = $1`,
      [id]
    )
    return rows[0] ? aTarea(rows[0]) : null
  } catch (error) {
    // 22P02: el id recibido no tiene formato de uuid, o sea que no existe.
    if (error.code === '22P02') return null
    throw error
  }
}

export async function actualizarTarea(id, { estado, resultado }) {
  const { rows } = await obtenerPool().query(
    `update orquestador_tarea
     set estado = $2, resultado = $3, actualizada_en = now()
     where id = $1
     returning ${COLUMNAS}`,
    [id, estado, resultado === undefined ? null : JSON.stringify(resultado)]
  )
  return rows[0] ? aTarea(rows[0]) : null
}
