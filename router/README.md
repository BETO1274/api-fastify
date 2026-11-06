# router

Router de canary. Es el único punto de entrada público de la demo: reparte las peticiones entre el servicio **stable** (API v3) y el **canary** (API v4), ambos en Render.

Reenvía cualquier verbo HTTP con su cuerpo, incluido `QUERY`. No conoce la lógica de negocio.

## Cómo decide a quién enviar cada petición

Por orden de prioridad:

| # | Condición | Destino | `X-Route-Reason` |
|---|---|---|---|
| 1 | Cabecera `x-canary: true` | canary | `header` |
| 2 | Cookie `track=canary` o `track=stable` (solo si el peso es > 0) | el asignado antes | `sticky` |
| 3 | Sorteo con el porcentaje `canary_weight` | canary o stable | `ponderado` |

- Con peso **0 %** no hay tráfico público a canary, pero `x-canary: true` sí llega (etapa 0, pruebas internas).
- Con peso 0 la cookie sticky se **ignora**: así el rollback es inmediato y nadie se queda pegado al canary.
- La cookie `track` dura 5 minutos (sesiones fijas) y solo se asigna cuando el peso es > 0.
- Toda respuesta lleva `X-Routed-To` (`stable` o `canary`) y `X-Route-Reason`. La API además devuelve `X-Track` y `X-App-Version`.

## Endpoints propios

Van bajo `/router/*` para no chocar con las rutas de la API.

| Ruta | Descripción |
|---|---|
| `GET /router/health` | Estado del router |
| `GET /router/metrics` | Métricas Prometheus: `router_requests_total{track,reason,status_class}`, `router_request_duration_seconds{track}`, `router_upstream_errors_total{track}`, `router_canary_weight` |
| `GET /router/weight` | Porcentaje actual a canary (requiere `x-admin-key`) |
| `POST /router/weight` | `{ "canary_weight": 25 }` cambia el porcentaje en caliente (requiere `x-admin-key`) |

## Variables de entorno

| Variable | Descripción |
|---|---|
| `STABLE_URL` | URL base del servicio stable en Render |
| `CANARY_URL` | URL base del servicio canary en Render |
| `CANARY_WEIGHT` | Porcentaje inicial hacia canary (0-100). Por defecto 0 |
| `ADMIN_KEY` | Clave para `/router/weight`. Sin ella el endpoint queda deshabilitado |
| `PORT` | Puerto (8080 por defecto) |
| `LOKI_URL` | URL de envío de logs, p. ej. `https://logs-prod-021.grafana.net/loki/api/v1/push` (opcional) |
| `LOKI_USER` | Usuario (Instance ID) de Loki (opcional) |
| `LOKI_TOKEN` | Token con permiso `logs:write` (opcional) |

## Logs de errores (Loki)

Si están definidas `LOKI_URL`, `LOKI_USER` y `LOKI_TOKEN`, el router envía a Grafana Loki **una línea por cada error**: respuestas 5xx de las APIs y fallos de conexión (502/504). Sin esas variables el registro queda desactivado y no afecta al tráfico.

- **Etiquetas de Loki:** `app="canary-router"`, `level`, `track` (`stable` o `canary`) y `version` (la que informa la API en `X-App-Version`).
- **Cada línea (JSON):** `status`, `method`, `path` (sin query), `request_id`, `reason` y `error` (los primeros 300 caracteres del cuerpo del error).
- **`X-Request-Id`:** el router lo genera (o respeta el que traiga la petición), lo envía a la API y lo devuelve en la respuesta, para buscar una petición concreta en los logs.

Consulta de ejemplo en Grafana: `{app="canary-router", level="error"} | json`

El porcentaje cambiado con `POST /router/weight` vive en memoria: si el servicio se reinicia, vuelve a `CANARY_WEIGHT`.

## Uso local

```bash
cd router
npm ci
npm test
STABLE_URL=http://localhost:3000 CANARY_URL=http://localhost:3001 npm start
```

## Publicación

Un tag `router-vX.Y.Z` dispara `.github/workflows/release-router.yml`: lint, pruebas, imagen en `ghcr.io/beto1274/canary-router:<tag>` y, si existen los secretos `RENDER_API_KEY` y `RENDER_SERVICE_ID_ROUTER`, despliegue en Render por digest.
