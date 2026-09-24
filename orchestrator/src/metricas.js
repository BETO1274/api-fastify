// Métricas de Prometheus del orchestrator/worker. Expuestas en GET /metrics
// para que Alloy las scrapee.
import client from 'prom-client'

export const registro = new client.Registry()
client.collectDefaultMetrics({ register: registro })

// Balance de peticiones despachadas a cada una de las 3 APIs del equipo —
// permite ver en Grafana cuánta carga recibe cada nube.
export const dispatcherLlamadasTotal = new client.Counter({
  name: 'dispatcher_llamadas_total',
  help: 'Peticiones despachadas a cada API del equipo, por servicio, método y resultado',
  labelNames: ['servicio', 'metodo', 'resultado'],
  registers: [registro]
})

export const dispatcherDuracionSegundos = new client.Histogram({
  name: 'dispatcher_duracion_segundos',
  help: 'Duración de las peticiones despachadas a cada API del equipo',
  labelNames: ['servicio'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [registro]
})

export const storageLlamadasTotal = new client.Counter({
  name: 'storage_llamadas_total',
  help: 'Llamadas al Object Storage de Inventario-U, por operación y resultado',
  labelNames: ['operacion', 'resultado'],
  registers: [registro]
})

export const storageDuracionSegundos = new client.Histogram({
  name: 'storage_duracion_segundos',
  help: 'Duración de las llamadas al Object Storage de Inventario-U',
  labelNames: ['operacion'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [registro]
})
