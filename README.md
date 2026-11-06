# api-fastify

API REST/QUERY para la gestión de producción y materiales. Construida con **Fastify 5**, **TypeBox**, **PostgreSQL (Supabase)**, empaquetada con **Docker** y desplegada mediante **2 pipelines de CI/CD independientes en GitHub Actions** hacia **Render**.

- **Repositorio:** https://github.com/BETO1274/api-fastify
- **Ramas:** `test` (desarrollo) → Pull Request → `produccion` (default)
- **Ambientes desplegados:**
  - Test: https://api-fastify-ce3a.onrender.com
  - Producción: https://api-fastify-produccion.onrender.com
- **Documentación interactiva (Swagger UI):** agregar `/docs` a cualquiera de las dos URLs.

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Servidor web | Fastify 5 |
| Lenguaje | JavaScript (ESM) |
| Validación | TypeBox → JSON Schema → `ajv` (nativo de Fastify) |
| Base de datos | PostgreSQL (Supabase), driver `pg` |
| Control de versiones de BD | Supabase CLI (migraciones en `supabase/migrations/`) |
| Documentación de la API | `@fastify/swagger` + `@fastify/swagger-ui` |
| Pruebas | Vitest + `fastify.inject()` (integración, sin mocks, contra BD real) |
| Contenedor | Docker (`node:22-alpine`, usuario no-root) |
| CI/CD | GitHub Actions (2 pipelines) |
| Hosting | Render (Web Services, 2 ambientes aislados) |
| Registro de imágenes | GitHub Container Registry (ghcr.io) |

---

## Arquitectura

### Estructura de carpetas (modular por características)

```
src/
├── app.js                        # Composición: registra plugins, módulos y el error handler
├── server.js                     # Único archivo que llama app.listen()
├── config/
│   └── db.js                     # Pool único de pg, compartido por todos los controllers
└── modules/
    ├── articulo/
    │   ├── articulo.routes.js     # Verbos HTTP + schema de cada ruta
    │   ├── articulo.schema.js     # Definiciones TypeBox (body, params, response)
    │   └── articulo.controller.js # Lógica de negocio + queries SQL
    ├── stock/        (misma estructura)
    ├── receta/        (misma estructura)
    └── fabricacion/   (misma estructura + lógica transaccional)

supabase/migrations/              # Migraciones SQL cronológicas
test/modules/                     # Pruebas de integración, una por entidad
postman/                          # Colección de validación end-to-end
.github/workflows/                # Los 2 pipelines
```

### Flujo de una petición

```mermaid
flowchart LR
    A[Cliente] -->|HTTP| B[routes.js<br/>define verbo + schema]
    B --> C{ajv valida<br/>body/params}
    C -->|inválido| D[400 automático<br/>nunca llega al controller]
    C -->|válido| E[controller.js<br/>pool.query]
    E --> F[(PostgreSQL<br/>Supabase)]
    F --> E
    E --> B
    B --> A
```

`fabricacion.controller.js` es la única excepción: en vez de `pool.query()` de una sola sentencia, abre una transacción manual (`pool.connect()` + `begin/commit/rollback`) porque una sola operación toca tres tablas (`receta`, `receta_ingrediente`, `stock`) más la propia `fabricacion`.

### Manejo de errores

`app.js` registra un `setErrorHandler` global que traduce errores de Postgres a respuestas HTTP correctas:

| Código Postgres | Significado | Respuesta HTTP |
|---|---|---|
| `23503` | Violación de llave foránea (ej. `articulo_id` inexistente) | `400 Bad Request` |
| `23514` | Violación de `CHECK` constraint | `400 Bad Request` |
| (validación de schema) | Body/params no cumplen el TypeBox schema | `400 Bad Request` (automático, vía `ajv`) |
| (no encontrado) | Recurso válido pero inexistente | `404 Not Found` (decisión explícita del controller) |

---

## Entidades y Endpoints

Todas las rutas devuelven JSON. Los cuerpos de `POST`/`PATCH`/`QUERY` van en formato `application/json`.

Cada entidad expone **dos formas de leer varios registros**: `GET /` (sin body, trae todo — internamente reutiliza la misma función de búsqueda que `QUERY`, sin filtros) y `QUERY /search` (con filtros en el body). `GET /` es además la única de las dos que funciona sin restricciones contra las URLs públicas de Render — ver la nota sobre Cloudflare en [`postman/README.md`](postman/README.md).

### 1. Articulo — `/articulos`

Catálogo base de materias primas y productos finales.

| Verbo | Ruta | Descripción | Body |
|---|---|---|---|
| `POST` | `/articulos` | Crea un artículo | `{ nombre: string, tipo: "materia_prima"\|"producto_final", unidad_medida: string }` |
| `GET` | `/articulos` | Lista **todos** los artículos, sin filtros | — |
| `GET` | `/articulos/:id` | Obtiene un artículo por id | — |
| `PATCH` | `/articulos/:id` | Actualiza parcialmente | Cualquier subconjunto del body de creación |
| `DELETE` | `/articulos/:id` | Elimina un artículo | — |
| `QUERY` | `/articulos/search` | Búsqueda avanzada | `{ nombre?, tipo?, unidad_medida? }` (filtros opcionales combinables) |

### 2. Stock — `/stock`

Control de inventario, relacionado a un artículo.

| Verbo | Ruta | Descripción | Body |
|---|---|---|---|
| `POST` | `/stock` | Crea una fila de stock | `{ articulo_id: integer, cantidad: number, ubicacion: string }` |
| `GET` | `/stock` | Lista **todas** las filas de stock, sin filtros | — |
| `GET` | `/stock/:id` | Obtiene una fila por id | — |
| `PATCH` | `/stock/:id` | Actualiza parcialmente | Cualquier subconjunto del body de creación |
| `DELETE` | `/stock/:id` | Elimina una fila | — |
| `QUERY` | `/stock/search` | Búsqueda avanzada | `{ articulo_id?, ubicacion? }` |

`cantidad` puede quedar en **negativo** — refleja un faltante real de inventario (ver `fabricacion`), no se bloquea.

### 3. Receta — `/recetas`

Fórmula de producción: qué artículo final se produce y con qué ingredientes.

| Verbo | Ruta | Descripción | Body |
|---|---|---|---|
| `POST` | `/recetas` | Crea una receta con sus ingredientes | `{ producto_final_id: integer, ingredientes: [{ articulo_id: integer, cantidad_necesaria: number }] }` (mínimo 1 ingrediente) |
| `GET` | `/recetas` | Lista **todas** las recetas con sus ingredientes, sin filtros | — |
| `GET` | `/recetas/:id` | Obtiene la receta con su arreglo de ingredientes | — |
| `PATCH` | `/recetas/:id` | Actualiza `producto_final_id` y/o **reemplaza** el arreglo completo de ingredientes | Cualquier subconjunto del body de creación |
| `DELETE` | `/recetas/:id` | Elimina la receta (los ingredientes se eliminan en cascada) | — |
| `QUERY` | `/recetas/search` | Búsqueda avanzada | `{ producto_final_id? }` |

Los ingredientes se modelan como tabla relacional (`receta_ingrediente`, FK real a `articulo`), no como JSON anidado sin validar.

### 4. Fabricacion — `/fabricaciones` (regla de negocio crítica)

Registra una orden de fabricación ejecutada.

| Verbo | Ruta | Descripción | Body |
|---|---|---|---|
| `POST` | `/fabricaciones` | **Ejecuta la fabricación** (ver regla abajo) | `{ receta_id: integer, cantidad_producir: number }` |
| `GET` | `/fabricaciones` | Lista **todas** las fabricaciones, sin filtros | — |
| `GET` | `/fabricaciones/:id` | Obtiene una fabricación por id | — |
| `PATCH` | `/fabricaciones/:id` | Corrige datos del registro (no reaplica movimientos de stock) | Cualquier subconjunto del body de creación |
| `DELETE` | `/fabricaciones/:id` | Elimina el registro (no revierte el stock) | — |
| `QUERY` | `/fabricaciones/search` | Búsqueda avanzada | `{ receta_id? }` |

**Regla de negocio crítica de `POST /fabricaciones`:** en una única transacción atómica —
1. Busca la receta y sus ingredientes.
2. Por cada ingrediente: `cantidad_necesaria × cantidad_producir` se **descuenta** del stock de ese artículo (si no hay fila de stock previa, se crea una nueva en negativo — se permite faltante).
3. Se **incrementa** el stock del `producto_final_id` de la receta en `cantidad_producir` (nueva fila de stock, ubicación "Producción").
4. Se inserta el registro de `fabricacion`.

Si la receta no existe → `404`, no se aplica ningún movimiento (rollback).

---

## Validaciones (TypeBox)

Cada ruta declara un `schema` que Fastify compila con `ajv` y valida **antes** de ejecutar el controller. Ejemplos:

- `tipo` de `articulo`: unión literal, solo `"materia_prima"` o `"producto_final"`.
- `:id` en params: `Type.Integer()` — rechaza valores no numéricos.
- `cantidad` de `stock`: `minimum: 0` en la creación.
- `ingredientes` de `receta`: `minItems: 1`.
- `cantidad_necesaria` / `cantidad_producir`: `exclusiveMinimum: 0`.
- Los `*BodyParcial` de cada `PATCH` son `Type.Partial(...)` del schema completo — todo opcional, pero si un campo viene, se valida igual.

---

## Base de datos

5 migraciones cronológicas en `supabase/migrations/`:

| Migración | Crea | Relaciones |
|---|---|---|
| `..._crear_tabla_articulo.sql` | `articulo` | — |
| `..._crear_tabla_stock.sql` | `stock` | `articulo_id → articulo.id` |
| `..._crear_tabla_receta.sql` | `receta` | `producto_final_id → articulo.id` |
| `..._crear_tabla_receta_ingrediente.sql` | `receta_ingrediente` | `receta_id → receta.id` (cascade), `articulo_id → articulo.id` |
| `..._crear_tabla_fabricacion.sql` | `fabricacion` | `receta_id → receta.id` |

```mermaid
erDiagram
    articulo ||--o{ stock : "articulo_id"
    articulo ||--o{ receta : "producto_final_id"
    receta ||--o{ receta_ingrediente : "receta_id (cascade)"
    articulo ||--o{ receta_ingrediente : "articulo_id"
    receta ||--o{ fabricacion : "receta_id"
```

**Política de migraciones:** siempre aditivas (`create table if not exists`, nunca `DROP`/`ALTER...DROP COLUMN` sobre algo en uso). Un cambio que requiera eliminar algo se hace en dos migraciones separadas (expand-contract).

---

## Pipelines CI/CD

Dos workflows independientes, cada uno de punta a punta para su propio ambiente:

### `pipeline-pruebas.yml` (rama `test`)
### `pipeline-produccion.yml` (rama `produccion`)

Ambos siguen la misma estructura:

```mermaid
flowchart TD
    A[Checkout + Node 22] --> B[npm ci]
    B --> C[Lint]
    C --> D[Migrar Supabase<br/>Session Pooler]
    D --> E[Tests + cobertura]
    E --> F{Quality gate<br/>Pruebas ≥60% / Producción ≥85%}
    F -->|falla| X[Pipeline se detiene<br/>NO despliega]
    F -->|pasa| G[docker build]
    G --> H[Smoke test<br/>arranca el contenedor real]
    H --> I[Publicar imagen en ghcr.io]
    I --> J{Evento}
    J -->|pull_request| K[Fin — solo valida]
    J -->|push| L[Deploy Hook → Render]
    L --> M[Registrar Dockerfile<br/>en rama deploys]
```

**Regla de aprobación obligatoria:** el job `deploy` depende (`needs: build-and-test`) del job anterior — si cualquier prueba falla o la cobertura no alcanza el umbral, el deploy **nunca se ejecuta**.

### Flujo completo de una promoción

1. Commit + push a `test` → `pipeline-pruebas.yml` corre completo, incluyendo el deploy a Render Test.
2. Se abre un Pull Request `test → produccion` → `pipeline-produccion.yml` corre en modo verificación (gate 85%), **sin desplegar** (evento `pull_request`).
3. Una regla de protección de rama exige ese check en verde antes de permitir el merge.
4. Al mergear (manual o auto-merge) se genera un `push` real sobre `produccion` → el pipeline corre de nuevo, esta vez **sí** ejecuta el deploy.

### Dónde ver la evidencia de cada corrida

| Evidencia | Dónde |
|---|---|
| Log del pipeline (cada paso) | [Actions](https://github.com/BETO1274/api-fastify/actions) |
| Imagen ya construida, persistente | [`api-fastify-test`](https://github.com/BETO1274/api-fastify/pkgs/container/api-fastify-test) · [`api-fastify-produccion`](https://github.com/BETO1274/api-fastify/pkgs/container/api-fastify-produccion) |
| Dockerfile exacto de cada deploy (commit + fecha) | Rama [`deploys`](https://github.com/BETO1274/api-fastify/tree/deploys/deploys) |
| Servicio corriendo, logs en vivo | Dashboard de Render → Events/Logs |

---

## Ambientes

| | Test | Producción |
|---|---|---|
| Rama | `test` | `produccion` |
| Base de datos | Proyecto Supabase Test | Proyecto Supabase Producción |
| Web Service | `api-fastify-test` | `api-fastify-produccion` |
| `NODE_ENV` | `staging` | `production` |
| Cobertura mínima | 60% | 85% |

Secrets separados por ambiente en GitHub Actions (`*_TEST` / `*_PROD`), variables de entorno separadas en Render.

---

## Pruebas

### Suite automatizada (Vitest)
```bash
npm test              # corre una vez
npm run test:coverage # con reporte de cobertura
```
48 pruebas de integración (sin mocks, `fastify.inject()` contra la BD real): CRUD completo, `QUERY`, 400 de validación, violaciones de FK, 404, y la verificación numérica exacta de la regla de negocio de `fabricacion`.

### Colección de Postman (contra el sistema v3 real en Azure, vía HTTP)
Ubicada en [`postman/`](postman/):
```
postman/
├── README.md                                 ← explica el workaround de QUERY (ver abajo)
├── gateway.postman_collection.json           ← 38 requests, flujo asíncrono completo
├── gateway.postman_environment.json          ← plantilla versionada (sin valores reales)
└── gateway.local.postman_environment.json    ← gitignorado, con la URL y la key reales
```

Importar en Postman, o correr con `newman`:
```bash
npx newman run postman/gateway.postman_collection.json -e postman/gateway.local.postman_environment.json
```

> **Nota:** Azure Container Apps bloquea en su ingress el método `QUERY` (no estándar) antes de llegar al contenedor. No es un bug del código: `QUERY` está implementado y probado en la suite automatizada (que no pasa por ningún proxy) y funcionaba sin problema en AKS (fase 2). El workaround — mandar `POST` con el header `X-HTTP-Method-Override: QUERY` — ya está aplicado en el código y en esta colección. Detalle completo en [`postman/README.md`](postman/README.md).

---

## Docker

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
EXPOSE 3000
USER node
CMD ["node", "src/server.js"]
```

- `node:22-alpine`: requerido por el plugin `@thecodepace/fastify-http-query` (necesita `QUERY` en `http.METHODS`, disponible desde Node 22).
- `npm ci --omit=dev`: instala exactamente las versiones del lockfile, sin dependencias de desarrollo (vitest, eslint, supabase CLI quedan fuera de la imagen final).
- `USER node`: el contenedor corre sin privilegios de root.
- `.dockerignore` excluye `node_modules`, `.git`, `.env`, `test/`, `supabase/`, etc.

---

## Canary Deployment (Seguimiento #3)

Estrategia de despliegue canary sobre este mismo microservicio. Hay dos versiones conviviendo en producción: **stable (API v3, `v3.0.1`)** y **canary (API v4, `v4.0.0`)**. Un router reparte el tráfico entre ellas por porcentaje y un *quality gate* decide si se promueve, se pausa o se aborta.

- **Proveedor:** Render (servicios Docker "Existing image"), imágenes en GitHub Container Registry, métricas en Grafana Cloud.
- **Mecanismo de enrutamiento:** Render no reparte tráfico entre servicios, así que el reparto lo hace un router propio (`router/`) con reparto ponderado, cabecera `x-canary: true` y cookie sticky. Ver `router/README.md`.
- **Versión y track en cada respuesta:** `X-App-Version` y `X-Track` (los pone la API) y `X-Routed-To` y `X-Route-Reason` (los pone el router). Permiten ver en vivo qué instancia atendió cada petición.
- **Artefacto inmutable:** la imagen se construye una vez por tag y se despliega en Render **por digest SHA256** (`ghcr.io/beto1274/api-fastify@sha256:...`).

### Arquitectura del despliegue

```mermaid
flowchart LR
    C[Cliente] --> R["Router de canary<br/>(Render)<br/>peso 0-100% / x-canary / cookie sticky"]
    R -->|"1 - peso"| S["api-fastify STABLE<br/>v3.0.1 (Render)"]
    R -->|"peso"| K["api-fastify CANARY<br/>v4.0.0 (Render)"]
    S --> DB[("Supabase PostgreSQL<br/>esquema compartido")]
    K --> DB
    A["Alloy (Render)"] -.scrape.-> R
    A -.scrape.-> S
    A -.scrape.-> K
    A -->|remote_write| G["Grafana Cloud<br/>tablero + alertas"]
    GH["GitHub Actions<br/>canary-promote"] -->|"POST /router/weight"| R
    GH -->|"snapshot / evaluar"| R
```

### Plan de etapas

El plan está definido como código en [`canary/slo.json`](canary/slo.json) y lo ejecuta [`canary/promover.sh`](canary/promover.sh) desde el workflow *Canary - Promover por etapas*.

| Etapa | Tráfico al canary | Bake time real | Bake time demo | Peticiones mínimas al canary | Cómo se accede |
|---|---|---|---|---|---|
| 0 | 0 % (solo interno) | prueba de humo | prueba de humo | n/a | cabecera `x-canary: true` |
| 1 | 10 % | 10 min | 90 s | 100 | reparto ponderado |
| 2 | 25 % | 10 min | 90 s | 150 | reparto ponderado |
| 3 | 50 % | 15 min | 90 s | 300 | reparto ponderado |
| 4 | 75 % | 10 min | 90 s | 300 | reparto ponderado |
| 5 | 100 % (promovido) | 10 min | 90 s | 300 | reparto ponderado; luego stable pasa a ejecutar la imagen v4 y el peso vuelve a 0 |

### Umbrales de decisión (SLO)

| Decisión | Condición |
|---|---|
| **Promover** | El canary alcanzó las peticiones mínimas de la etapa y cumple todos los umbrales |
| **Pausar** | Aún no hay muestra suficiente: se extiende la observación (hasta 3 veces), nunca se promueve a ciegas |
| **Abortar** | Con al menos 20 peticiones: errores 5xx del canary > 2 %, o superan a stable por más de 1 punto, o p95 > max(1.5 × stable, stable + 100 ms), o p99 > max(2 × stable, stable + 250 ms) |

Al abortar, el router queda en **0 % hacia canary y 100 % hacia stable** de inmediato (con peso 0 la cookie sticky se ignora) y se limpian los datos de prueba. El gate compara contra la línea base stable medida en el mismo router y bajo la misma carga concurrente (`canary/carga.mjs`), no contra un valor fijo.

### Compatibilidad de datos (Expand/Contract)

La v4 agrega `articulo.categoria` con la migración `supabase/migrations/20261105190000_agregar_categoria_articulo.sql`:

1. **Expand (esta entrega):** `alter table articulo add column categoria text null`. Es una columna **opcional y sin NOT NULL**: la v3 no la conoce, no la devuelve (su esquema de respuesta la omite) y sus `INSERT` siguen funcionando.
2. **Migrate:** la v4 acepta, guarda, filtra y devuelve `categoria`. Con stable y canary activos a la vez, ambas leen y escriben la misma tabla sin conflicto.
3. **Contract (futuro, solo cuando v3 ya no exista):** recién entonces se podría volver obligatoria la columna o quitar lo viejo. No se hace ninguna migración destructiva que impida el rollback.

### Cambio funcional observable en v4

`POST /articulos` y `PATCH /articulos/:id` aceptan `categoria`; las respuestas la incluyen; `QUERY /articulos/search` filtra por `{ "categoria": "..." }`. La v3 ignora el campo.

### Inyección de fallos (solo canary)

Con `APP_TRACK=canary` y `TEAM_API_KEY` definida, la v4 expone `POST /admin/caos` (`{ "latencia_ms": 400, "tasa_error": 0.5 }`), `GET` y `DELETE`, y acepta el header `x-chaos: latency=800,error=0.3`. Todo exige `x-api-key`. En stable esos endpoints no existen (404). El workflow de promoción tiene la opción `inyectar_falla` para simular una regresión y verificar el aborto.

### Cómo operarlo

| Acción | Cómo |
|---|---|
| Publicar stable / canary | `git tag v3.x.y` / `git tag v4.x.y` y `git push --tags`: construye la imagen y la despliega por digest en el servicio correspondiente |
| Publicar el router | tag `router-vX.Y.Z` |
| Promoción por etapas | Actions → **Canary - Promover por etapas** → *Run workflow* (`demo` y `inyectar_falla` opcionales) |
| Rollback inmediato | Actions → **Canary - Rollback inmediato** |
| Cambiar el peso a mano | `curl -X POST $ROUTER_URL/router/weight -H "x-admin-key: ..." -d '{"canary_weight":25}'` |
| Ver quién atiende | `curl -i $ROUTER_URL/articulos/1` → cabeceras `X-Routed-To`, `X-Track`, `X-App-Version` |
| Observabilidad | `observabilidad/README.md` (Alloy, tablero y alertas en Grafana Cloud) |

## Documentación adicional

- **Guía de sustentación** (arquitectura, migraciones, pruebas, guion de defensa): ver el artefacto publicado por separado.
- **Swagger UI**: `/docs` en cualquiera de los dos ambientes desplegados.
