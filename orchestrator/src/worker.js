import { existsSync } from 'node:fs'
import { createServer } from 'node:http'

if (existsSync('.env')) {
  process.loadEnvFile('.env')
}

const { ServiceBusClient } = await import('@azure/service-bus')
const { despachar } = await import('./dispatcher.js')
const { actualizarTarea } = await import('./tareas.js')
const { claveDeCache, obtenerDeCache, guardarEnCache } = await import('./cache-cliente.js')
const { guardarEnStorage } = await import('./storage-cliente.js')
const { registro } = await import('./metricas.js')

const QUEUE_NAME = process.env.SERVICEBUS_QUEUE_NAME || 'tareas-orquestador'
const MAX_DELIVERY_COUNT = Number(process.env.SERVICEBUS_MAX_DELIVERY_COUNT || 3)

// Las llamadas al Storage pasan por este proceso (no por el orchestrator
// API), así que las métricas de /metrics de app.js nunca las verían — el
// worker necesita su propio endpoint mínimo para que Alloy lo scrapee.
const METRICS_PORT = Number(process.env.METRICS_PORT || 3101)
createServer(async (request, response) => {
  if (request.url === '/metrics') {
    response.setHeader('Content-Type', registro.contentType)
    response.end(await registro.metrics())
    return
  }
  response.writeHead(404)
  response.end()
}).listen(METRICS_PORT, () => {
  console.log(`Métricas del worker en :${METRICS_PORT}/metrics`)
})

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

    // El trace-id vino del gateway (o del cliente) — nunca se reemplaza,
    // para poder seguir la tarea en los logs de las 3 nubes.
    const traceId = tarea.traceId ?? tarea.id

    // Solo se cachea lectura (GET): cachear POST/PATCH/DELETE serviría datos
    // viejos después de una escritura real.
    const esLectura = tarea.metodo === 'GET'
    const claveCache = esLectura ? claveDeCache(tarea) : null

    if (claveCache) {
      const enCache = await obtenerDeCache(claveCache, traceId)
      if (enCache !== undefined) {
        console.log(`Tarea ${tarea.id} resuelta desde cache (${claveCache})`)
        await registrarEstado(tarea.id, { estado: 'completado', resultado: enCache })
        await guardarEnStorage(traceId, enCache)
        await receiver.completeMessage(mensaje)
        return
      }
    }

    let resultado
    try {
      resultado = await despachar({
        servicio: tarea.servicio,
        metodo: tarea.metodo,
        ruta: tarea.ruta,
        body: tarea.body,
        traceId
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
    if (claveCache) await guardarEnCache(claveCache, resultado, traceId)
    // Storage guarda siempre, sin importar el método — es el registro
    // histórico del flujo completo (a diferencia de la Cache, que es solo GET).
    await guardarEnStorage(traceId, resultado)
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
