# Colección de Postman — Canary (stable v3 y canary v4)

Pruebas de las **dos versiones de la API** y del **router** de la entrega de Canary Deployments, contra los servicios desplegados en Render. 40 requests en 6 carpetas, con 82 aserciones.

## Archivos

* `canary.postman_collection.json` — la colección.
* `canary-nube.postman_environment.json` — environment versionado, con `team_api_key` y `admin_key` vacías (plantilla, nunca lleva claves reales).
* `canary-nube.local.postman_environment.json` — **gitignorado**, con las claves reales. Se crea copiando el versionado y completando `team_api_key` y `admin_key`:
  ```bash
  cp postman/canary-nube.postman_environment.json postman/canary-nube.local.postman_environment.json
  ```

## Variables de environment

| Variable | Qué es | Valor |
|---|---|---|
| `stable_url` | API v3 (track stable) | `https://api-fastify-stable.onrender.com` |
| `canary_url` | API v4 (track canary) | `https://api-fastify-canary.onrender.com` |
| `router_url` | router de canary | `https://canary-router-router-v1-0-0.onrender.com` |
| `team_api_key` | `TEAM_API_KEY` del canary (protege `/admin/caos`) | secreta |
| `admin_key` | `ADMIN_KEY` del router (protege `/router/weight`) | secreta |

## Carpetas

| Carpeta | Qué prueba |
|---|---|
| `00 - Salud, versiones y metricas` | `/health` de los tres servicios, `X-App-Version` y `X-Track`, y `/metrics` con `track` y `version` |
| `01 - Stable (v3.0.1)` | CRUD completo y `QUERY`; la v3 **no** devuelve `categoria` |
| `02 - Canary (v4.0.0)` | CRUD completo y `QUERY`; la v4 guarda, filtra y devuelve `categoria` |
| `03 - Canary: inyeccion de fallos` | activa el caos (500), comprueba el error y lo apaga; 401 sin clave y 404 en stable |
| `04 - Router` | acceso con `x-canary`, cambio de peso en caliente y rollback a 0 % |
| `05 - Errores 4xx esperados` | 404 y 400 en las dos versiones |

Cada carpeta crea y borra sus propios datos, y las que cambian el estado (caos y peso) lo dejan apagado y en 0 al terminar.

## Cómo correrla

1. Importa `canary.postman_collection.json` y el environment `canary-nube.local.postman_environment.json` en Postman.
2. Selecciona ese environment y usa el **Collection Runner**, en orden (de arriba hacia abajo): los requests guardan el id que usa el siguiente.

Con `newman` (CLI, no requiere abrir Postman):
```bash
npx newman run postman/canary.postman_collection.json -e postman/canary-nube.local.postman_environment.json
```

Antes de correrla despierta los servicios (el plan gratis de Render los duerme): `curl` a `/health` de stable y canary y a `/router/health`.

Si algún request de la carpeta 03 falla a medias, ejecuta el 5 (`DELETE apagar el caos`) para no dejar la falla activa.

## Nota sobre `QUERY`

Los requests `QUERY` se mandan como **`POST` con el header `X-HTTP-Method-Override: QUERY`**: es el mecanismo que la API entiende y funciona detrás de cualquier proxy.
