# Plan — Orchestrator + Cola (componente transversal, Azure)

> Estado: **pendiente de implementar**. Este documento es el plan aprobado a la fecha; falta el contrato de Cache (deportBack) y Storage (Inventario-U) antes de poder construir el flujo completo.

## Reparto de componentes transversales del equipo

| Componente | Responsable | 
|---|---|
| Orchestrator + Cola | Nosotros (Azure) |
| Cache + Gateway | deportBack ("sport") |
| Storage + Analítica transversal | Inventario-U ("inventory") |

## Qué hace el Orchestrator

- Recibe HTTP (`POST /orquestar`), no ejecuta nada directamente — valida y encola.
- Responde de inmediato (`202 Accepted` + id de tarea), sin esperar el procesamiento.
- Expone `GET /orquestar/:id` para consultar el estado (pendiente / completado / fallido).

## La cola

- **Azure Service Bus** (tier Basic — barato, con dead-letter queue nativa).
- Reintentos automáticos ante fallo; tras agotarlos, el mensaje cae a la dead-letter queue en vez de perderse.

## Dispatcher genérico (decisión ya tomada)

El mensaje encolado trae la petición completa a reenviar — no son casos de uso fijos, es un despachador genérico que cubre los 6 verbos (GET, POST, PATCH/PUT, DELETE, QUERY) de las 3 APIs sin código adicional por combinación:

```json
{
  "servicio": "api_fastify" | "deportback" | "inventario_u",
  "metodo": "GET" | "POST" | "PATCH" | "DELETE" | "QUERY",
  "ruta": "/fabricaciones",
  "body": { "receta_id": 5, "cantidad_producir": 10 }
}
```

Nota sobre QUERY: si `servicio: "api_fastify"` apunta a nuestra URL de Render, QUERY falla por el bloqueo de Cloudflare (documentado en `postman/README.md`) — para que el orquestador pueda usar QUERY contra nosotros de forma confiable, debe estar configurado con la URL de AKS.

## Flujo del worker (versión completa, con Cache y Storage)

1. Toma el mensaje de la cola.
2. **Si `metodo == GET`:** primero consulta el Cache de deportBack (key derivada de `servicio` + `ruta`). Si hay dato, lo usa directo. Si no, llama a la API real y escribe el resultado en el Cache (write-through) para la próxima consulta.
3. **Si `metodo != GET`** (escritura): va directo a la API real, nunca pasa por cache.
4. **Siempre, al terminar (éxito o fallo):** guarda el JSON del resultado (petición + respuesta + estado) en el Storage de Inventario-U, alimentando su capa de analítica transversal.
5. Actualiza el estado de la tarea en nuestra propia base de datos (tabla nueva `orquestador_tarea`).
6. Si falla tras los reintentos de Service Bus, el mensaje cae a la dead-letter queue.

## Pendiente antes de implementar (bloqueante)

Pedir a los compañeros el contrato exacto de sus servicios:

**A deportBack (Cache + Gateway):**
- URL base del servicio de Cache.
- Cómo se consulta una key (`GET /cache/:key`? formato de la key?).
- Cómo se escribe (`POST /cache` con `{key, value, ttl}`?).

**A Inventario-U (Storage + Analítica):**
- URL base del servicio de Storage.
- Cómo se sube un JSON (`POST /storage`? qué campos espera?).

## Archivos a crear cuando se implemente

- `orchestrator/src/server.js` — `POST /orquestar`, `GET /orquestar/:id`.
- `orchestrator/src/worker.js` — consumidor de la cola, dispatcher genérico + cache + storage.
- `orchestrator/src/tareas.js` — persistencia del estado (tabla `orquestador_tarea` en nuestra BD Azure).
- `orchestrator/src/cache-cliente.js` — llamadas al Cache de deportBack (con timeout/degradación elegante, mismo patrón que `http-externo.js`).
- `orchestrator/src/storage-cliente.js` — llamadas al Storage de Inventario-U (mismo patrón).
- `orchestrator/Dockerfile`
- `infra/main.bicep` — agregar namespace de Azure Service Bus (tier Basic) + la cola.
- `k8s/orchestrator-deployment.yaml`, `k8s/orchestrator-service.yaml`, `k8s/worker-deployment.yaml` — mismo clúster AKS existente, namespace nuevo `orchestrator` (separado del namespace `api-fastify`, pero sin duplicar el clúster ni el Load Balancer).

## Verificación (cuando se implemente)

- `POST /orquestar` con `servicio: "api_fastify"`, `metodo: "POST"`, `ruta: "/fabricaciones"` → confirmar que la fabricación se crea de verdad.
- Repetir un `GET` dos veces seguidas → confirmar que la segunda viene del Cache (más rápida, o con algún indicador de "cache hit").
- Revisar que cada tarea procesada generó su JSON en el Storage de Inventario-U.
- Forzar un fallo (ej. `receta_id` inexistente) → confirmar que cae a la dead-letter queue tras los reintentos.
