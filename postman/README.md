# Colección de Postman — Canary (stable v3 y canary v4)

Pruebas de las **dos versiones de la API** y del **router** de la entrega de Canary Deployments. 40 requests en 6 carpetas, con 82 aserciones.

## Archivos

* `canary.postman_collection.json` — la colección.
* `canary-nube.postman_environment.json` — environment de **Render** versionado, con `team_api_key` y `admin_key` vacías (plantilla, sin claves reales).
* `canary-local.postman_environment.json` — environment para correr las dos APIs en **localhost** (`stable` en 3000, `canary` en 3001, router en 8080).
* `canary-nube.local.postman_environment.json` — **gitignorado**, con las claves reales. Se crea copiando el versionado y completando `team_api_key` y `admin_key`.

## Variables de environment

| Variable | Qué es | Nube | Local |
|---|---|---|---|
| `stable_url` | API v3 (track stable) | `https://api-fastify-stable.onrender.com` | `http://localhost:3000` |
| `canary_url` | API v4 (track canary) | `https://api-fastify-canary.onrender.com` | `http://localhost:3001` |
| `router_url` | router de canary | `https://canary-router-router-v1-0-0.onrender.com` | `http://localhost:8080` |
| `team_api_key` | `TEAM_API_KEY` del canary (protege `/admin/caos`) | secreta | `clave-local` |
| `admin_key` | `ADMIN_KEY` del router (protege `/router/weight`) | secreta | `clave-local` |

## Carpetas

| Carpeta | Qué prueba |
|---|---|
| `00 - Salud, versiones y metricas` | `/health` de los tres servicios, `X-App-Version` y `X-Track`, y `/metrics` con `track` y `version` |
| `01 - Stable (v3.0.1)` | CRUD completo y `QUERY`; la v3 **no** devuelve `categoria` |
| `02 - Canary (v4.0.0)` | CRUD completo y `QUERY`; la v4 guarda, filtra y devuelve `categoria` |
| `03 - Canary: inyeccion de fallos` | activa el caos (500), comprueba el error, lo apaga; 401 sin clave y 404 en stable |
| `04 - Router` | acceso con `x-canary`, cambio de peso en caliente y rollback a 0 % |
| `05 - Errores 4xx esperados` | 404 y 400 en las dos versiones |

Cada carpeta crea y borra sus propios datos, y las que cambian el estado (caos y peso) lo dejan apagado y en 0 al terminar.

## Cómo correrla

En Postman: importa la colección y un environment, selecciónalo y usa el **Collection Runner** en orden. Con `newman`:

```bash
npx newman run postman/canary.postman_collection.json -e postman/canary-nube.local.postman_environment.json
```

Antes de correrla contra Render, despierta los servicios (el plan gratis los duerme): `curl` a `/health` de stable y canary y a `/router/health`.

## Correrla en local

```bash
# canary (v4, código actual)
PORT=3001 APP_TRACK=canary APP_VERSION=4.0.0 TEAM_API_KEY=clave-local DATABASE_URL=... node src/server.js
# stable (v3): el código del tag v3.0.1, en otra carpeta
git worktree add ../api-v3 v3.0.1 && cd ../api-v3 && npm ci
PORT=3000 APP_TRACK=stable APP_VERSION=3.0.1 DATABASE_URL=... node src/server.js
# router
cd router && STABLE_URL=http://localhost:3000 CANARY_URL=http://localhost:3001 ADMIN_KEY=clave-local node src/server.js
```

## Nota sobre `QUERY`

Los requests `QUERY` se mandan como `POST` con `X-HTTP-Method-Override: QUERY`, igual que en la colección del gateway: es el mecanismo que la API entiende y funciona detrás de cualquier proxy.

---

# Colección de Postman — Gateway (v3)

Suite de validación end-to-end contra el sistema v3 completo: **Gateway → Orquestador → Service Bus → Worker → api-fastify**. Flujo asíncrono: cada request de creación devuelve `202` con un `id` de tarea, y el request siguiente (`.2`) consulta el resultado con `GET /orquestar/:id`.

## Archivos

* `gateway.postman_collection.json` — la colección (38 requests, 59 assertions): salud/seguridad, CRUD directo de las 4 entidades propias (`articulos`, `stock`, `recetas`, `fabricaciones`), el envelope v2 (degrada con gracia sin las APIs de los otros equipos, que v3 ya no usa) y los 6 verbos completos creando/borrando su propio dato.
* `gateway.postman_environment.json` — environment versionado, con `base_url` y `team_api_key` vacíos (plantilla, nunca lleva valores reales).
* `gateway.local.postman_environment.json` — **gitignorado**, con los valores reales (`base_url` del deploy actual en Azure Container Apps + la `team_api_key` real de `credentials.local.md`). Cópialo desde el versionado si no lo tienes:
  ```bash
  cp postman/gateway.postman_environment.json postman/gateway.local.postman_environment.json
  ```
  y completa ahí `base_url` (con `terraform output -raw gateway_url`, ver `terraform/README.md`) y `team_api_key`.

## Cómo correrla

1. Importa `gateway.postman_collection.json` y el environment `gateway.local.postman_environment.json` en Postman (o usa `newman`, ver abajo).
2. Selecciona ese environment.
3. Ejecuta con **Collection Runner**, en orden (de arriba hacia abajo) — los requests `.1` (crear tarea) guardan el `tarea_id` que usa el `.2` siguiente (consultar resultado). Deja un pequeño delay entre requests si corres manualmente uno por uno; el Runner y `newman` ya esperan la respuesta de cada paso antes de seguir.

Con `newman` (CLI, no requiere abrir Postman):
```bash
npx newman run postman/gateway.postman_collection.json -e postman/gateway.local.postman_environment.json
```

## Variable `team_api_key`

El gateway exige el header `X-Api-Key` en todo lo que no sea `/health` — sin la key correcta, responde `401`. El valor real está en `credentials.local.md`, sección `TEAM_API_KEY`; solo va en el environment `.local` (gitignorado), nunca en el versionado.

## ⚠️ Nota sobre el verbo QUERY

Azure Container Apps bloquea en su ingress (basado en Envoy) el método HTTP `QUERY` (no estándar) antes de que la petición llegue al contenedor — incluso en tráfico interno entre Container Apps. No es un bug de la implementación: `QUERY` está correctamente soportado por Fastify (`fastify.query()`), probado en la suite automatizada (`fastify.inject()`, que no pasa por ningún proxy) y funcionaba sin problema en AKS (fase 2).

El workaround, ya aplicado en el código y en esta colección: los requests `QUERY` se mandan como **`POST` con el header `X-HTTP-Method-Override: QUERY`**. Tanto `api-fastify` como el `gateway` (y el `dispatcher` del orquestador, en el salto interno hacia `api-fastify`) restauran el método real antes de enrutar — ver `src/app.js`, `gateway/src/app.js` y `orchestrator/src/dispatcher.js`. Si armas un request `QUERY` nuevo a mano en Postman, usa este mismo patrón (método `POST` + ese header) en vez del verbo `QUERY` directo, o Azure lo va a rechazar con `400 Bad Request` en texto plano antes de llegar a la app.
