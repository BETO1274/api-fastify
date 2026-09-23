# Gateway

Único punto de entrada público del equipo (nuestra parte, Azure). No decide nada de negocio: valida la key, asigna un `X-Trace-Id` y reenvía todo al orquestador. Toda la lógica (cache, storage, despacho a las 3 APIs) vive en `../orchestrator`.

```
Cliente ──► Gateway ──► Orquestador ──► Cache / Storage / API destino
```

## Cómo se usa

`{método} /{servicio}/{ruta...}` se traduce a una tarea del orquestador:

```
GET  http://<gateway>/api_fastify/articulos/1?x=2
  →   POST /orquestar  { "servicio": "api_fastify", "metodo": "GET", "ruta": "/articulos/1?x=2" }
```

* `servicio`: `api_fastify`, `deportback` o `inventario_u`. Cualquier otro da `404`.
* Métodos: `GET`, `POST`, `PUT`, `PATCH`, `DELETE` y `QUERY`. El body (si lo hay) se reenvía tal cual; `GET` y `DELETE` no llevan body.
* La respuesta es exactamente la del orquestador (hoy `202` con el id de la tarea).
* `GET /orquestar/:id` consulta el estado de una tarea.
* `GET /health` no pide key.

## Seguridad y trazabilidad

* Si `TEAM_API_KEY` está configurada, toda ruta excepto `/health` exige el header `X-Api-Key` (`401` si falta o es incorrecto). Sin la variable, queda abierto.
* Si no llega `X-Trace-Id`, se genera uno; se devuelve en la respuesta y se manda al orquestador.
* El orquestador no debe tener IP pública: reenvía a las 3 APIs con la key compartida, así que este gateway es la única puerta.

## Correr en local

```bash
cp .env.example .env     # ORQUESTADOR_URL apunta a http://localhost:3100
npm install
npm run dev              # :3200
npm test
```

## Variables

| Variable | Para qué |
|---|---|
| `ORQUESTADOR_URL` | URL interna del orquestador (en K8s: `http://orchestrator`) |
| `TEAM_API_KEY` | Key compartida del equipo |
| `PORT` | Puerto (3200 por defecto) |

## Fallos del orquestador

`502` si no responde, `504` si tarda más de 10 s, `500` si `ORQUESTADOR_URL` no está configurada.

Manifiestos de Kubernetes: `../k8s/gateway/`.
