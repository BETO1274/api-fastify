// Punto único de acceso al estado de las tareas. Si hay DATABASE_URL usa la
// tabla orquestador_tarea (compartida entre servidor y worker); si no, usa
// memoria — útil para pruebas rápidas y para correr los tests sin depender
// de ningún servicio externo.
import * as memoria from './tareas-memoria.js'
import * as postgres from './tareas-pg.js'

function almacen() {
  return process.env.DATABASE_URL ? postgres : memoria
}

export async function crearTarea(datos) {
  return almacen().crearTarea(datos)
}

export async function obtenerTarea(id) {
  return almacen().obtenerTarea(id)
}

export async function actualizarTarea(id, cambios) {
  return almacen().actualizarTarea(id, cambios)
}
