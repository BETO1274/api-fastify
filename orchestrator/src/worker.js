import { existsSync } from 'node:fs'

if (existsSync('.env')) {
  process.loadEnvFile('.env')
}

const { ServiceBusClient } = await import('@azure/service-bus')
const { despachar } = await import('./dispatcher.js')
const { actualizarTarea } = await import('./tareas.js')

const QUEUE_NAME = process.env.SERVICEBUS_QUEUE_NAME || 'tareas-orquestador'
const MAX_DELIVERY_COUNT = Number(process.env.SERVICEBUS_MAX_DELIVERY_COUNT || 3)

const connectionString = process.env.SERVICEBUS_CONNECTION_STRING
if (!connectionString) {
  console.error('Falta SERVICEBUS_CONNECTION_STRING como variable de entorno')
  process.exit(1)
}

const client = new ServiceBusClient(connectionString)
const receiver = client.createReceiver(QUEUE_NAME)

// Guarda el estado de la tarea; si la BD falla, lo registra en el log pero no
// interrumpe el manejo del mensaje de la cola.
async function registrarEstado(id, cambios) {
  try {
    await actualizarTarea(id, cambios)
  } catch (error) {
    console.error(`No se pudo guardar el estado de la tarea ${id}: ${error.message}`)
  }
}

console.log(`Worker escuchando la cola "${QUEUE_NAME}"...`)

receiver.subscribe({
  processMessage: async (mensaje) => {
    const tarea = mensaje.body
    console.log(`Procesando tarea ${tarea.id}: ${tarea.metodo} ${tarea.servicio}${tarea.ruta}`)

    let resultado
    try {
      resultado = await despachar({
        servicio: tarea.servicio,
        metodo: tarea.metodo,
        ruta: tarea.ruta,
        body: tarea.body,
        // El id de la tarea es interno del orquestador — el trace-id es el
        // que vino del gateway (o del cliente), y es el que hay que reenviar
        // para que se pueda seguir la tarea en los logs de las 3 nubes.
        traceId: tarea.traceId ?? tarea.id
      })
    } catch (error) {
      const intentoActual = mensaje.deliveryCount + 1
      const esUltimoIntento = intentoActual >= MAX_DELIVERY_COUNT

      if (esUltimoIntento) {
        console.error(`Tarea ${tarea.id} falló definitivamente tras ${intentoActual} intentos: ${error.message} — cae a dead-letter`)
        await registrarEstado(tarea.id, {
          estado: 'fallido',
          resultado: { error: error.message, intentos: intentoActual }
        })
        await receiver.deadLetterMessage(mensaje, {
          deadLetterReason: 'FalloDespacho',
          deadLetterErrorDescription: error.message
        })
      } else {
        console.warn(`Tarea ${tarea.id} falló (intento ${intentoActual}/${MAX_DELIVERY_COUNT}): ${error.message} — reintentando`)
        await receiver.abandonMessage(mensaje)
      }
      return
    }

    // El despacho ya ocurrió: aunque no se pueda guardar el estado, el mensaje
    // se completa igual para no repetir el efecto (por ejemplo, un POST doble).
    console.log(`Tarea ${tarea.id} completada — status ${resultado.status}`)
    await registrarEstado(tarea.id, { estado: 'completado', resultado })
    await receiver.completeMessage(mensaje)
  },
  processError: async (args) => {
    console.error('Error en el receiver de la cola:', args.error)
  }
})

process.on('SIGINT', async () => {
  console.log('\nCerrando worker...')
  await receiver.close()
  await client.close()
  process.exit(0)
})
