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
