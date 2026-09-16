// Placeholder de persistencia — guarda las tareas en memoria del proceso.
// Se reemplaza por una tabla real en la base de datos (orquestador_tarea)
// cuando se conecte la cola de verdad (paso 4 del plan, docs/plan-orquestador.md).

const tareas = new Map()

export function crearTarea({ servicio, metodo, ruta, body }) {
  const id = crypto.randomUUID()
  tareas.set(id, {
    id,
    servicio,
    metodo,
    ruta,
    body,
    estado: 'pendiente',
    resultado: null,
    creadaEn: new Date().toISOString()
  })
  return tareas.get(id)
}

export function obtenerTarea(id) {
  return tareas.get(id) ?? null
}

export function actualizarTarea(id, cambios) {
  const tarea = tareas.get(id)
  if (!tarea) return null
  Object.assign(tarea, cambios)
  return tarea
}

// Solo para pruebas — limpia el estado entre corridas.
export function limpiarTareas() {
  tareas.clear()
}
