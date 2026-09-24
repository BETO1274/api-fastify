// Métricas de Prometheus para las llamadas al Storage de Inventario-U (OCI).
// Expuestas en GET /metrics para que Alloy las scrapee.
import client from 'prom-client'

export const registro = new client.Registry()
client.collectDefaultMetrics({ register: registro })

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
