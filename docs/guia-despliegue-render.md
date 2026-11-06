# Guía paso a paso: desplegar el canary en Render

Orden obligatorio: **stable → canary → router → (Alloy)**. Cada servicio es un *Web Service* de Render con **Existing image** (Docker), no se construye desde Git: el despliegue lo hacen los workflows por digest.

## 0. Antes de empezar

- Los paquetes de GitHub deben ser **públicos**: `api-fastify` (ya lo es) y `canary-router` (se crea al publicar el tag `router-v1.0.0`; cámbialo a público en *Packages → canary-router → Package settings → Change visibility*).
- Usa el plan **Starter** de Render en los tres servicios durante la demo. El plan gratis duerme el servicio tras ~15 min sin tráfico y el arranque en frío distorsiona la latencia que se compara.
- Ten a mano la cadena de conexión de Supabase (`DATABASE_URL`, la misma que `DATABASE_URL_PROD`).

## 1. Servicio stable (API v3)

Render → **New** → **Web Service** → **Existing image**.

| Campo | Valor |
|---|---|
| Image URL | `ghcr.io/beto1274/api-fastify:v3.0.1` (todo en minúsculas, sin `https://`) |
| Name | `api-fastify-stable` |
| Health check path | `/health` |
| Auto-deploy | n/a (las imágenes no se autodespliegan) |

Variables de entorno: `DATABASE_URL` (Supabase), `PORT=3000`. `TEAM_API_KEY` es opcional en stable.

Cuando esté en *Live*, copia su URL (`https://api-fastify-stable.onrender.com`) y su **Service ID** (`srv-...`, aparece en la URL del dashboard).

Prueba: `curl -i https://api-fastify-stable.onrender.com/health` → debe traer `X-Track: stable` y `X-App-Version: 3.0.1`.

## 2. Servicio canary (API v4)

Igual que el anterior:

| Campo | Valor |
|---|---|
| Image URL | `ghcr.io/beto1274/api-fastify:v4.0.0` |
| Name | `api-fastify-canary` |
| Health check path | `/health` |

Variables: `DATABASE_URL` (la misma), `PORT=3000` y **`TEAM_API_KEY` obligatoria** (inventa una cadena larga: protege `/admin/caos`).

Prueba: `curl -i .../health` → `X-Track: canary`, `X-App-Version: 4.0.0`.

> La migración de `categoria` ya está aplicada en Supabase (la aplica el pipeline de `produccion`). Stable y canary comparten la misma base.

## 3. Router

| Campo | Valor |
|---|---|
| Image URL | `ghcr.io/beto1274/canary-router:router-v1.0.0` |
| Name | `canary-router` |
| Health check path | `/router/health` |

Variables:

| Variable | Valor |
|---|---|
| `STABLE_URL` | URL del servicio stable |
| `CANARY_URL` | URL del servicio canary |
| `CANARY_WEIGHT` | `0` |
| `ADMIN_KEY` | cadena larga inventada (para `/router/weight`) |
| `PORT` | `8080` |

Pruebas (cambia `ROUTER` por la URL del router):

```bash
curl -i $ROUTER/health                              # X-Routed-To: stable
curl -i -H "x-canary: true" $ROUTER/health          # X-Routed-To: canary  (etapa 0)
curl -s -H "x-admin-key: TU_CLAVE" $ROUTER/router/weight   # {"canary_weight":0}
```

## 4. Secretos y variables de GitHub

Repositorio → **Settings → Secrets and variables → Actions**.

**Secretos** (pestaña *Secrets*):

| Nombre | Valor |
|---|---|
| `RENDER_API_KEY` | Render → Account Settings → API Keys |
| `RENDER_SERVICE_ID_STABLE` | `srv-...` del stable |
| `RENDER_SERVICE_ID_CANARY` | `srv-...` del canary |
| `RENDER_SERVICE_ID_ROUTER` | `srv-...` del router |
| `ROUTER_ADMIN_KEY` | el mismo valor de `ADMIN_KEY` del router |
| `CANARY_TEAM_API_KEY` | el mismo valor de `TEAM_API_KEY` del canary |

**Variables** (pestaña *Variables*): `ROUTER_URL` (URL del router) y `CANARY_URL` (URL del canary), ambas sin barra final.

Por terminal (con la cuenta `BETO1274` activa), te pide el valor sin dejarlo en el historial:

```bash
gh secret set RENDER_API_KEY --repo BETO1274/api-fastify
gh variable set ROUTER_URL --repo BETO1274/api-fastify --body "https://canary-router.onrender.com"
```

## 5. Verificación final

1. `curl -i $ROUTER/articulos/1` varias veces: con peso 0 siempre `X-Routed-To: stable`.
2. Actions → **Canary - Rollback inmediato** → *Run workflow*: debe terminar en verde (comprueba que el router, los secretos y la clave admin funcionan).
3. Actions → **Canary - Promover por etapas** con `demo` activado: primera vuelta de prueba.

## 6. Alloy y el tablero

Sigue `observabilidad/README.md` (cuenta de Grafana Cloud, Alloy como *Background Worker*, importar `dashboard.json` y crear las alertas).

## Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| `No public image found` en Render | Paquete privado, URL con mayúsculas o etiqueta sin la `v`. Debe ser `ghcr.io/beto1274/api-fastify:v3.0.1` |
| El router responde 502 | `STABLE_URL` o `CANARY_URL` mal escritas, o el servicio aún no está *Live* |
| `/admin/caos` responde 401 | `TEAM_API_KEY` no está definida en el canary, o `CANARY_TEAM_API_KEY` en GitHub no coincide |
| El workflow de promoción falla en el paso 0 | El router no llega al canary con `x-canary: true`: revisa `CANARY_URL` |
