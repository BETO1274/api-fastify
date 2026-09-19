# Orchestrator + Cola

Microservicio transversal del equipo (nuestra parte, Azure). Tiene dos procesos que corren por separado:

* **Servidor HTTP** (`src/server.js`): recibe `POST /orquestar`, guarda la tarea en la base de datos y la encola en Azure Service Bus. Responde `202` de inmediato.
* **Worker** (`src/worker.js`): toma cada mensaje de la cola y lo despacha a la API correspondiente (nuestra, deportBack o Inventario-U). Si funciona, marca la tarea `completado`; si falla, reintenta hasta `MaxDeliveryCount` veces y luego la manda a la dead-letter queue y la marca `fallido`.

`GET /orquestar/:id` consulta el estado (`pendiente` / `completado` / `fallido`). Plan completo en `../docs/plan-orquestador.md`.

## Correr todo en local (sin tocar Azure)

`docker compose up -d` levanta tres cosas, todas gratis y sin cuenta de Azure:

| Contenedor | Para qué | Puerto |
|---|---|---|
| `orchestrator-servicebus-emulator` (+ `orchestrator-sqledge`) | Emulador oficial de Azure Service Bus | 5672 |
| `orchestrator-postgres` | Base de datos con la tabla `orquestador_tarea` (se crea sola) | 5433 |

**1. Levantar los contenedores:**
```bash
docker compose up -d
docker logs orchestrator-servicebus-emulator --tail 3   # esperar "Emulator Service is Successfully Up!" (~30-60 s)
```

**2. Configurar `.env`** (copia `.env.example`). Para local:
```
DATABASE_URL=postgresql://orquestador:orquestador_dev@localhost:5433/orquestador
SERVICEBUS_CONNECTION_STRING=Endpoint=sb://localhost;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=SAS_KEY_VALUE;UseDevelopmentEmulator=true;
SERVICEBUS_QUEUE_NAME=tareas-orquestador
SERVICEBUS_MAX_DELIVERY_COUNT=3
API_FASTIFY_URL=http://localhost:3000
TEAM_API_KEY=<la key compartida, ver credentials.local.md>
```
La connection string del emulador es fija, no la cambies.

**3. Correr servidor y worker** (dos terminales):
```bash
npm install
npm run dev      # servidor HTTP en :3100
npm run worker   # consumidor de la cola
```

**4. Probar:**
```bash
curl -X POST http://localhost:3100/orquestar -H "Content-Type: application/json" \
  -d "{\"servicio\":\"api_fastify\",\"metodo\":\"GET\",\"ruta\":\"/articulos/1\"}"
# -> 202 con la tarea (estado "pendiente"); tras unos segundos:
curl http://localhost:3100/orquestar/<id>     # -> estado "completado" con la respuesta de la API
```

**5. Apagar:**
```bash
docker compose down
```

## Base de datos

El esquema está en `db/schema.sql` (tabla `orquestador_tarea`, migración aditiva). El contenedor local lo aplica solo al arrancar. Para aplicarlo a otra base (por ejemplo la de Azure) usa `npm run db:init` con su `DATABASE_URL`; es idempotente.

## Sin Docker (solo memoria)

Sin `DATABASE_URL`, el estado de las tareas queda en memoria del proceso y **no se comparte con el worker**. Sin `SERVICEBUS_CONNECTION_STRING`, `POST /orquestar` registra la tarea pero no la encola. Ese es el modo en que corren los tests (`npm test`), sin depender de ningún servicio externo.

## Estructura

* `src/app.js` — composición Fastify.
* `src/orquestar.routes.js` — `POST /orquestar`, `GET /orquestar/:id`.
* `src/orquestar.schema.js` — validación TypeBox del dispatcher genérico (`servicio`, `metodo`, `ruta`, `body`).
* `src/cola.js` — cliente de Azure Service Bus (enviar).
* `src/dispatcher.js` — reenvía la tarea a la API real, con `X-Api-Key` y `X-Trace-Id`.
* `src/worker.js` — consumidor de la cola, reintentos y dead-letter.
* `src/tareas.js` — acceso al estado; usa `tareas-pg.js` (Postgres) si hay `DATABASE_URL`, o `tareas-memoria.js` si no.
* `src/db.js` — pool de Postgres.
* `db/schema.sql`, `scripts/aplicar-esquema.js` — esquema y su aplicador.

## Nombre de namespace del emulador

El emulador exige que el namespace se llame exactamente `sbemulatorns` (no configurable) — así está en `emulator-config.json`.
