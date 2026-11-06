import client from 'prom-client'

// Metricas del router: son el SLI "visto por el cliente" de cada track.
// Lo que mide el router incluye la red hacia el servicio, por lo que sirve
// de comparacion justa entre stable y canary (mismo camino, misma medicion).
export function crearMetricas() {
  const registro = new client.Registry()
  client.collectDefaultMetrics({ register: registro })

  return {
    registro,
    peticiones: new client.Counter({
      name: 'router_requests_total',
      help: 'Peticiones enrutadas, por track, motivo de la decision y clase de estado',
      labelNames: ['track', 'reason', 'status_class'],
      registers: [registro]
    }),
    duracion: new client.Histogram({
      name: 'router_request_duration_seconds',
      help: 'Latencia total extremo a extremo por track',
      labelNames: ['track'],
      buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [registro]
    }),
    erroresUpstream: new client.Counter({
      name: 'router_upstream_errors_total',
      help: 'Fallos al contactar el servicio destino (502/504)',
      labelNames: ['track'],
      registers: [registro]
    }),
    peso: new client.Gauge({
      name: 'router_canary_weight',
      help: 'Porcentaje de trafico publico enviado a canary',
      registers: [registro]
    })
  }
}
