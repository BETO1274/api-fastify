# Colección de Postman — api-fastify

Suite de validación end-to-end contra los ambientes reales (Test, Producción y Local).

## Archivos

* `api-fastify.postman_collection.json` — la colección (32 requests: CRUD + QUERY + casos 400/404 + validación numérica de la regla de negocio de `fabricacion`).
* `api-fastify-test.postman_environment.json` — `base_url` → Test (público, vía Render).
* `api-fastify-produccion.postman_environment.json` — `base_url` → Producción (público, vía Render).
* `api-fastify-local.postman_environment.json` — `base_url` → `http://localhost:3000` (servidor corriendo en tu máquina con `npm run dev`, conectado a la BD real de Supabase Test). Útil para demostrar que `QUERY` funciona sin la restricción de Cloudflare.

## Cómo correrla

1. Importar los 4 archivos en Postman (o usar `newman`, ver abajo).
2. Seleccionar el Environment correspondiente.
3. Ejecutar con **Collection Runner**, en orden (de arriba hacia abajo) — los requests de creación guardan el ID en variables de colección que usan los requests siguientes.

### Variables de colección (`articulo_insumo_id`, `receta_id`, etc.)

Estas variables se rellenan automáticamente cuando corres la colección completa por el **Collection Runner**: el request "POST crear articulo" guarda el id que crea, y los requests siguientes lo reutilizan.

Si en cambio abres y mandas **un request suelto** (sin haber corrido antes el que crea el dato), esas variables tienen un valor por defecto: apuntan a los **datos de demo sembrados en Test** (Harina de trigo, Pastel de vainilla, su receta y una fabricación ya ejecutada — ver la sección de datos de demo más abajo). Así cualquier `GET`/`PATCH`/`QUERY` individual funciona apenas lo abras.

⚠️ **Cuidado con los requests `DELETE` sueltos**: si los mandas individualmente usando esos valores por defecto, vas a borrar los datos de demo reales, no datos descartables. Los `DELETE` son seguros solo dentro de una corrida completa del Runner (crean su propio dato desechable y lo borran al final) — para probar un `DELETE` suelto sin arriesgar la demo, cambia primero la variable a un id que no te importe perder.

Con `newman` (CLI, no requiere abrir Postman):
```bash
npx newman run postman/api-fastify.postman_collection.json -e postman/api-fastify-test.postman_environment.json
npx newman run postman/api-fastify.postman_collection.json -e postman/api-fastify-produccion.postman_environment.json
npx newman run postman/api-fastify.postman_collection.json -e postman/api-fastify-local.postman_environment.json  # requiere `npm run dev` corriendo
```

## ⚠️ Nota sobre el verbo QUERY

Las URLs públicas de Render (`*.onrender.com`) pasan por **Cloudflare**, que bloquea en el borde el método HTTP `QUERY` (no estándar) antes de que llegue a la aplicación — responde `405 Method Not Allowed` con el header `Server: cloudflare`. **No es un bug del código**: `QUERY` está implementado correctamente y probado en la suite automatizada (`fastify.inject()`, sin pasar por Cloudflare) y en el smoke test del pipeline (habla directo con el contenedor). Es una limitación de la capa gratuita de infraestructura de Render, fuera de nuestro control.

Los requests `QUERY` de esta colección detectan ese bloqueo específico (405 + `Server: cloudflare`) y lo reportan como un test informativo en vez de un fallo — así la corrida completa siempre queda en verde, distinguiendo claramente "esto no se pudo probar por la plataforma" de "esto está roto".

Como efecto colateral, el paso de limpieza que borra el stock generado por `fabricacion` (que depende de `QUERY /stock/search` para encontrar la fila) tampoco puede autolimpiarse contra las URLs públicas — queda documentado en el propio test, y se puede borrar a mano desde el Table Editor de Supabase si hace falta.

**Contra `Local`, en cambio, `QUERY` funciona normal** (no hay Cloudflare de por medio) — la corrida completa contra `localhost` pasa las 49 assertions sin ningún bloqueo ni limpieza pendiente, confirmando que la implementación de `QUERY` es correcta y el único problema es la capa de infraestructura de Render.
