# Orchestrator + Cola

Microservicio transversal del equipo (nuestra parte, Azure): recibe HTTP, encola en Azure Service Bus, y un worker despacha la tarea a la API correspondiente (nuestra, deportBack o Inventario-U). Ver el plan completo en `../docs/plan-orquestador.md`.

## Correr en local (sin tocar Azure — con el emulador)

Azure Service Bus tiene un emulador oficial en Docker, gratis, sin necesitar ninguna cuenta ni recurso real. Sirve para desarrollar y probar todo el flujo antes de desplegar.

**1. Levantar el emulador:**
```bash
docker compose up -d
```
Tarda ~30-60 segundos en terminar de inicializar (crea sus bases de datos internas). Verificar con:
```bash
docker logs orchestrator-servicebus-emulator --tail 5
```
Debe aparecer `Emulator Service is Successfully Up!`.

**2. Configurar `.env`** (copia `.env.example` y no cambies la connection string, es fija para el emulador):
```
SERVICEBUS_CONNECTION_STRING=Endpoint=sb://localhost;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=SAS_KEY_VALUE;UseDevelopmentEmulator=true;
SERVICEBUS_QUEUE_NAME=tareas-orquestador
```

**3. Correr el servidor:**
```bash
npm install
npm run dev
```

**4. Probar:**
```bash
curl -X POST http://localhost:3100/orquestar -H "Content-Type: application/json" -d "{\"servicio\":\"api_fastify\",\"metodo\":\"GET\",\"ruta\":\"/articulos/1\"}"
```
Responde `202` con la tarea. El mensaje ya quedó en la cola real (emulada) — `GET /orquestar/:id` con el id que devolvió confirma el estado.

**5. Apagar el emulador cuando termines:**
```bash
docker compose down
```

## Correr sin la cola (memoria, sin Docker)

Si no tienes `SERVICEBUS_CONNECTION_STRING` configurada, `POST /orquestar` sigue funcionando (queda solo en memoria, con un warning en el log) — útil para probar rápido el API sin levantar Docker. Así es como corren los tests automatizados (`npm test`), sin depender de ningún servicio externo.

## Estructura

* `src/app.js` — composición Fastify.
* `src/orquestar.routes.js` — `POST /orquestar`, `GET /orquestar/:id`.
* `src/orquestar.schema.js` — validación TypeBox del dispatcher genérico (`servicio`, `metodo`, `ruta`, `body`).
* `src/cola.js` — cliente de Azure Service Bus.
* `src/tareas-memoria.js` — persistencia placeholder (se reemplaza por una tabla real en el siguiente paso del plan).

## Nombre de namespace del emulador

El emulador exige que el namespace se llame exactamente `sbemulatorns` (no configurable) — así está en `emulator-config.json`. No lo cambies, o el emulador lo rechaza con una advertencia (no rompe, pero queda mal documentado).
