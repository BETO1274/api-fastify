import { ServiceBusClient } from '@azure/service-bus'

const QUEUE_NAME = process.env.SERVICEBUS_QUEUE_NAME || 'tareas-orquestador'

let cliente = null

function obtenerCliente() {
  if (!cliente) {
    const connectionString = process.env.SERVICEBUS_CONNECTION_STRING
    if (!connectionString) {
      throw new Error('Falta SERVICEBUS_CONNECTION_STRING como variable de entorno')
    }
    cliente = new ServiceBusClient(connectionString)
  }
  return cliente
}

// Manda una tarea a la cola. El id ya viene generado (se persiste en la BD
// antes de encolar, para que GET /orquestar/:id funcione aunque el mensaje
// todavía no se haya procesado).
export async function encolarTarea(tarea) {
  const sender = obtenerCliente().createSender(QUEUE_NAME)
  try {
    await sender.sendMessages({
      body: tarea,
      contentType: 'application/json',
      messageId: tarea.id
    })
  } finally {
    await sender.close()
  }
}

export async function cerrarCliente() {
  if (cliente) {
    await cliente.close()
    cliente = null
  }
}
