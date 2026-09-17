import { existsSync } from 'node:fs'

if (existsSync('.env')) {
  process.loadEnvFile('.env')
}

const { ServiceBusClient } = await import('@azure/service-bus')
const { despachar } = await import('./dispatcher.js')

const QUEUE_NAME = process.env.SERVICEBUS_QUEUE_NAME || 'tareas-orquestador'
const MAX_DELIVERY_COUNT = Number(process.env.SERVICEBUS_MAX_DELIVERY_COUNT || 3)

const connectionString = process.env.SERVICEBUS_CONNECTION_STRING
if (!connectionString) {
  console.error('Falta SERVICEBUS_CONNECTION_STRING como variable de entorno')
  process.exit(1)
}

const client = new ServiceBusClient(connectionString)
const receiver = client.createReceiver(QUEUE_NAME)

console.log(`Worker escuchando la cola "${QUEUE_NAME}"...`)

receiver.subscribe({
  processMessage: async (mensaje) => {
    const tarea = mensaje.body
    console.log(`Procesando tarea ${tarea.id}: ${tarea.metodo} ${tarea.servicio}${tarea.ruta}`)

    try {
      const resultado = await despachar({
        servicio: tarea.servicio,
        metodo: tarea.metodo,
        ruta: tarea.ruta,
        body: tarea.body,
        traceId: tarea.id
      })
      console.log(`Tarea ${tarea.id} completada — status ${resultado.status}`)
      await receiver.completeMessage(mensaje)
    } catch (error) {
      const intentoActual = mensaje.deliveryCount + 1
      const esUltimoIntento = intentoActual >= MAX_DELIVERY_COUNT

      if (esUltimoIntento) {
        console.error(`Tarea ${tarea.id} falló definitivamente tras ${intentoActual} intentos: ${error.message} — cae a dead-letter`)
        await receiver.deadLetterMessage(mensaje, {
          deadLetterReason: 'FalloDespacho',
          deadLetterErrorDescription: error.message
        })
      } else {
        console.warn(`Tarea ${tarea.id} falló (intento ${intentoActual}/${MAX_DELIVERY_COUNT}): ${error.message} — reintentando`)
        await receiver.abandonMessage(mensaje)
      }
    }
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
