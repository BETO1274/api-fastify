# Observabilidad del canary (Grafana Cloud)

Cómo se ven, lado a lado, las métricas de **stable (v3)** y **canary (v4)** durante la promoción y el rollback.

```
router ──/router/metrics──┐
api stable ──/metrics─────┼─► Alloy (Render) ──remote_write──► Grafana Cloud (Prometheus) ──► tablero + alerta
api canary ──/metrics─────┘
```

- **Router:** mide lo que ve el cliente por track (`router_requests_total`, `router_request_duration_seconds`, `router_upstream_errors_total`, `router_canary_weight`). Es la base de la comparación justa: mismo camino y misma medición para los dos tracks.
- **APIs:** exponen `process_cpu_seconds_total`, `process_resident_memory_bytes` (saturación) y `articulos_creados_total` (negocio), todas con las etiquetas `track` y `version`.

## 1. Crear la cuenta y obtener los datos de conexión

1. Entra a <https://grafana.com> → **Create free account** (el plan gratuito alcanza).
2. Abre tu stack → **Connections** → **Hosted Prometheus metrics** → **Send metrics**.
3. Copia tres datos: la **URL de remote write** (termina en `/api/prom/push`), el **usuario** (un número) y crea un **token** con el permiso `metrics:write`.

## 2. Desplegar Alloy en Render (por imagen Docker)

Alloy se publica como imagen en ghcr.io, igual que la API y el router: el tag `alloy-v1.0.0` dispara `.github/workflows/release-alloy.yml`, que valida `config.alloy` y publica `ghcr.io/beto1274/canary-alloy:alloy-v1.0.0`.

1. Pon el paquete `canary-alloy` en **público** (GitHub → Packages → `canary-alloy` → *Package settings* → *Change visibility*).
2. Render → **New** → **Web Service** → **Existing image**. Image URL: `ghcr.io/beto1274/canary-alloy:alloy-v1.0.0`. Name: `canary-alloy`.
3. Variables de entorno:

| Variable | Valor |
|---|---|
| `PORT` | `12345` (el puerto en el que escucha Alloy) |
| `ROUTER_HOST` | host del router con puerto, p. ej. `canary-router-router-v1-0-0.onrender.com:443` |
| `STABLE_HOST` | `api-fastify-stable.onrender.com:443` |
| `CANARY_HOST` | `api-fastify-canary.onrender.com:443` |
| `GRAFANA_REMOTE_WRITE_URL` | la URL del paso 1 |
| `GRAFANA_USER` | el usuario del paso 1 |
| `GRAFANA_TOKEN` | el token del paso 1 (solo se escribe en Render) |

Los hosts van **sin** `https://` y **con** `:443`.

> **Plan gratis de Render:** el servicio se duerme tras ~15 minutos sin peticiones entrantes y Alloy solo hace peticiones salientes. Para la demostración basta con despertarlo justo antes (`curl https://TU-ALLOY.onrender.com/-/ready`) y repetirlo a mitad de la sesión si dura más de 15 minutos.

## 3. Importar el tablero

Grafana → **Dashboards** → **New** → **Import** → sube `observabilidad/dashboard.json` y elige tu fuente de datos Prometheus (la de Grafana Cloud). El tablero se llama **Canary: stable vs canary** y refresca cada 10 s.

Paneles: peso hacia canary, versiones en ejecución, muestra acumulada, tráfico, errores 5xx, latencia p50/p95/p99, errores 502/504, CPU, memoria y artículos creados por minuto. Canary va en naranja y stable en azul.

## 4. Alerta (quality gate en la nube)

El quality gate automático corre en el pipeline (`canary/gate.mjs`, umbrales en `canary/slo.json`). La alerta de Grafana es la segunda red de seguridad y deja evidencia visible durante la demo.

Grafana → **Alerting** → **Alert rules** → **New alert rule** (fuente: Prometheus de Grafana Cloud):

**Regla 1, errores del canary**

```
sum(rate(router_requests_total{track="canary",status_class="5xx"}[1m]))
  / sum(rate(router_requests_total{track="canary"}[1m])) > 0.02
```

**Regla 2, latencia p95 del canary**

```
histogram_quantile(0.95, sum by (le) (rate(router_request_duration_seconds_bucket{track="canary"}[1m]))) > 0.5
```

Para las dos: evaluar cada **15 s**, *pending period* de **1 m**, etiqueta `severity=critical`. Agrega un *contact point* (correo) para recibir el aviso. Las reglas también pueden dispararse sobre el peso con `router_canary_weight > 0` para que no alerten cuando el canary no recibe tráfico.

## Qué mirar en la demostración

1. **Etapa 0:** `router_canary_weight` en 0 y la curva de canary plana, aunque `curl -H 'x-canary: true'` sí responde desde canary.
2. **Promoción:** el peso sube 10 → 50 → 100 y el tráfico de canary crece en la misma proporción. Latencia y errores quedan parecidos a stable.
3. **Rollback:** con `inyectar_falla` aparece la subida de errores y de p95 en canary, el gate aborta, el peso cae a 0 y el tráfico de canary desaparece mientras stable sigue sano.
