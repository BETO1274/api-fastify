# Generador de carga (k6)

`k6-flujo.js` genera carga reproducible sobre el flujo `GET /api/v2/articulos/:id` de api-fastify, el coordinador: en una sola petición conecta las tres nubes (api-fastify en Azure, deportBack e Inventario-U) con el mismo `X-Trace-Id`. El perfil es **fijo y está declarado en el propio script**: la Ronda 0 y la Ronda 1 usan exactamente el mismo, porque no se acepta comparar dos mediciones con cargas distintas. Si se cambia algo, hay que repetir las dos rondas.

## Perfil de carga "P"

| Escalón | Tasa | Duración | Para qué |
|---|---|---|---|
| Calentamiento | 2 req/s | 30 s | estabilizar conexiones y réplicas |
| Base | 5 req/s | 60 s | estado estable, antes del fallo |
| Carga | 10 req/s | 120 s | aquí cae la ventana de inyección |
| Recuperación | 2 req/s | 60 s | observar la vuelta al estado estable |

Total: 270 s. Modelo de **tasa fija** (`ramping-arrival-rate`): la tasa de llegada no baja cuando el sistema se vuelve lento. Con usuarios fijos, una API lenta reduciría sola la carga y ocultaría el problema. Hasta 150 VUs en vuelo; si se agotan, k6 lo reporta como `dropped_iterations` (se registra en la evidencia).

Respeta a los otros equipos: el pico es de 10 flujos/s, o sea unas 10 peticiones/s a cada una de sus APIs.

## Ejecutar

Necesita [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) instalado.

```bash
mkdir -p resultados
k6 run \
  -e BASE_URL=http://<ip-publica-de-api-fastify> \
  -e API_KEY=<clave-del-equipo> \
  -e EJECUCION_ID=r0-001 -e RONDA=0 -e EXPERIMENTO=latencia-saliente \
  load/k6-flujo.js
```

| Variable | Obligatoria | Qué es |
|---|---|---|
| `BASE_URL` | sí | Dirección pública de api-fastify (la IP del LoadBalancer que publica el workflow de despliegue). |
| `API_KEY` | si el sistema la exige | `X-Api-Key` compartida. Nunca va en Git. |
| `EJECUCION_ID`, `RONDA`, `EXPERIMENTO` | recomendadas | Identifican la ejecución en la evidencia y en las etiquetas de k6. |
| `ARTICULO` | no | Id propio de api-fastify (por defecto `1`, que siempre existe tras el seed). El v2 toma de las otras APIs su primer registro, así que no hacen falta ids de otros equipos. |
| `MAX_P95_MS`, `MAX_ERROR_RATE`, `MIN_FLUJO_EXITO` | no | Umbrales. **No tienen valor por defecto: no se inventan.** Salen del estado estable medido. Con ellos, k6 termina con error si no se cumplen (base del chaos gate). |
| `RESULTADOS_DIR` | no | Carpeta del resumen de evidencia (por defecto `resultados`). |

## Qué mide

* **Latencia extremo a extremo** (`http_req_duration{endpoint:flujo}`): p95 y p99.
* **`flujo_exito`**: HTTP 200 **y** las dos APIs externas respondieron (ninguna trae `error` en `apis_externas`). Una respuesta degradada no cuenta como éxito: una respuesta de error más rápida no demuestra por sí sola una mejora.
* **`flujo_degradado`**: HTTP 200 con respuesta parcial.
* **`trace_id_devuelto`**: que el `X-Trace-Id` enviado vuelva igual en la respuesta (un id único por petición, derivado de `EJECUCION_ID`, para buscarla en los logs de las tres nubes).
* Tasa de error HTTP, throughput y peticiones descartadas.

Al terminar escribe `resultados/<EJECUCION_ID>.json` con `execution_id`, `round`, `experiment`, marcas de tiempo UTC, requests totales, errores, tasa de error, p50/p90/p95/p99, throughput y el resultado de cada umbral. **MTTD y MTTR quedan como "no medido por k6"**: no se inventan, se calculan después a partir de la serie de tiempo y de las marcas del experimento.
