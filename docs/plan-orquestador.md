# Plan — Gateway + Orchestrator + Cola (componentes transversales, Azure)

> Estado (19/sep): pasos 1 a 4 **hechos y en `produccion`**; pasos 6 y 7 (Dockerfiles, manifiestos de K8s, gateway y cola en el Bicep) **construidos**, probados en local con contenedores pero **sin desplegar en AKS** (el clúster está borrado). Falta el contrato de Cache (deportBack) y Storage (Inventario-U) para cerrar el flujo completo (paso 5).

## Reparto de componentes transversales del equipo

| Componente | Responsable |
|---|---|
| Gateway + Orchestrator + Cola | Nosotros (Azure) |
| Cache | deportBack ("sport") |
| Storage + Analítica transversal | Inventario-U ("inventory") |

Nota: el gateway estaba asignado a deportBack en una versión anterior de este plan; quedó en nuestro lado.

## Flujo completo

```
Cliente ──► Gateway ──► Orquestador ─┬─► Cache      (deportBack)
            (nuestro)   (nuestro)    ├─► Storage    (Inventario-U)
                                     └─► API destino (api_fastify | deportback | inventario_u)
```

**Lectura (`GET`):**
1. Consulta el **Cache**; si hay dato, lo devuelve.
2. Si no, consulta el **Storage**; si hay dato, lo devuelve y repuebla el Cache.
3. Si tampoco, llama a la **API real**, guarda el resultado en Cache y en Storage, y lo devuelve.

**Escritura (`POST`/`PUT`/`PATCH`/`DELETE`/`QUERY` que modifica):** va siempre a la API real, por la cola. Al terminar guarda el JSON en el Storage e invalida en el Cache las keys afectadas.

## Gateway (nuevo microservicio nuestro)

- Es el **único componente con IP pública**. Recibe cualquier petición y la reenvía al orquestador; no decide nada de negocio.
- Valida `X-Api-Key` de quien llama, genera `X-Trace-Id` si no llega y lo propaga.
- Traduce `{método} /{servicio}/{ruta...}` (con su body) a la petición `POST /orquestar` `{servicio, metodo, ruta, body}` del orquestador, y devuelve lo que el orquestador responda.
- Soporta los 6 verbos, incluido `QUERY` (con `@thecodepace/fastify-http-query`).

**Por qué el orquestador no debe exponerse directo:** reenvía a las 3 APIs usando la `TEAM_API_KEY` compartida. Si `POST /orquestar` fuera público y sin autenticación, cualquiera podría escribir y borrar datos en las 3 APIs con esa key. Por eso en Kubernetes el orquestador va como `Service` `ClusterIP` (solo interno) y solo el gateway es `LoadBalancer`.

## Qué hace el Orchestrator

- `POST /orquestar` valida `{servicio, metodo, ruta, body}` (dispatcher genérico, 6 verbos × 3 APIs), guarda la tarea en la tabla `orquestador_tarea` y la encola en Azure Service Bus. Responde `202` con el id.
- `GET /orquestar/:id` consulta el estado (`pendiente` / `completado` / `fallido`).
- El **worker** (proceso aparte) toma cada mensaje, despacha a la API con `X-Api-Key` y `X-Trace-Id`, reintenta hasta `MaxDeliveryCount` y luego manda a la dead-letter queue.

Nota sobre QUERY: si `servicio: "api_fastify"` apunta a nuestra URL de Render, QUERY falla por el bloqueo de Cloudflare (ver `postman/README.md`). Debe apuntar a la URL de AKS.

## Decisión de diseño pendiente de confirmar: ¿síncrono o asíncrono?

Con la cola, la respuesta natural es asíncrona (`202` + id). Pero un cache que responde tarde no sirve. **Propuesta (híbrida):**

- **`GET`:** la consulta al Cache y al Storage se hace **dentro del handler**, de forma síncrona. Si hay dato responde `200` de inmediato con un campo `origen` (`cache` / `storage`). Si no lo hay, encola (`202` + id); el worker llama a la API, guarda en Cache y Storage, y el cliente consulta `GET /orquestar/:id` o repite el `GET` (que ahora ya da cache hit).
- **Escrituras:** siempre `202` + id, por la cola.

Alternativa descartada por ahora: que el handler espere el resultado del worker (long-poll). Es más cómodo para el cliente pero más complejo.

## Consistencia del Cache

- Key: `{servicio}:{ruta}` (incluyendo query string).
- Tras una escritura exitosa sobre `/x/:id`, invalidar `/x/:id` y `/x` (la lista).
- TTL corto como red de seguridad ante datos que cambian por fuera del orquestador.
- Storage: guarda cada JSON; qué versión se lee y cómo se versiona depende del contrato de Inventario-U.

## Pendiente bloqueante: contratos de Cache y Storage

Antes que nada, confirmar si cada uno es una **API HTTP suya** o un **servicio nativo** (Redis, S3, OCI Object Storage), porque cambia el cliente que usamos.

**deportBack (Cache):** ¿sigue arriba `35.224.94.116`? (hacía timeout el 19/sep). URL o `host:puerto`, cómo se lee/escribe una key, formato de la key, TTL, autenticación.

**Inventario-U (Storage):** URL o endpoint, cómo se sube un JSON (ruta, campos), credenciales si las hay.

**Ambos:** si aceptan `X-Api-Key` y `X-Trace-Id`, y si su firewall deja entrar desde nuestra nube (la IP de salida de AKS cambia al recrear el clúster).

## Pasos

| # | Paso | Estado |
|---|---|---|
| 1 | Servidor HTTP del orquestador (`POST /orquestar`, `GET /orquestar/:id`) | ✅ |
| 2 | Cola real (Azure Service Bus), probada con el emulador local | ✅ |
| 3 | Worker + dispatcher genérico, reintentos y dead-letter | ✅ |
| 4 | Estado de tareas compartido en Postgres (`orquestador_tarea`) | ✅ |
| 5 | Cache + Storage en el flujo del orquestador | ⏳ bloqueado por los contratos |
| 6 | Dockerfile + manifiestos K8s del orquestador y el worker (namespace `orchestrator`, mismo clúster; `ClusterIP`) + cola de Service Bus en `infra/main.bicep` | ✅ construido, sin desplegar |
| 7 | Gateway (`gateway/`, `LoadBalancer`) | ✅ construido, sin desplegar |

## Archivos a crear

Pendiente (paso 5): `orchestrator/src/cache-cliente.js` y `orchestrator/src/storage-cliente.js` — mismo patrón que `http-externo.js` (timeout corto, degradación elegante si el servicio no está configurado).

Ya creados (pasos 6 y 7):
- `gateway/` — proyecto Node independiente, con su `Dockerfile`, pruebas y README.
- `orchestrator/Dockerfile` — una imagen para el servidor y el worker.
- `k8s/orchestrator/` — namespace, configmap, secret de ejemplo, deployments de `orchestrator`, `worker` y `gateway`, y los services (`ClusterIP` para el orquestador, `LoadBalancer` para el gateway).
- `infra/main.bicep` — namespace y cola de Azure Service Bus (tier Basic). La tabla `orquestador_tarea` va en la misma base de Azure, con `npm run db:init`.
- Los dos pipelines existentes ahora también prueban, construyen, hacen smoke test y publican las imágenes del orquestador y del gateway (se mantienen los 2 pipelines).

## Verificación

- Un `GET` repetido dos veces por el gateway: la segunda respuesta viene con `origen: "cache"`.
- Tras un `PATCH`/`DELETE` por el gateway, el `GET` siguiente ya no devuelve el dato viejo.
- Cada tarea procesada deja su JSON en el Storage de Inventario-U.
- Un fallo forzado (`receta_id` inexistente) cae a la dead-letter queue tras los reintentos.
- Llamar al orquestador directo desde fuera del clúster no es posible (`ClusterIP`); solo el gateway lo alcanza.
