# Infraestructura como código (Bicep)

Este archivo (`main.bicep`) recrea la infraestructura de Azure que usamos para la fase 2 (multicloud): el servidor de PostgreSQL (tier gratis) y el clúster AKS con monitoreo nativo (Container Insights + Prometheus administrado).

No incluye una IP pública fija — al recrear el clúster, el `Service` de Kubernetes obtiene una IP nueva. Hay que actualizar `postman/api-fastify-aks.postman_environment.json` y avisarle al equipo cuando eso pase.

## Requisitos

* Azure CLI (`az`) instalado y autenticado (`az login`).
* El Resource Group `DEVOPS` debe existir (no lo crea este Bicep, es intencional — así no se borra por accidente si algún día se destruyen los recursos de adentro).

## Desplegar TODO desde cero (infraestructura + datos + app)

Hay un archivo `infra/scripts/.env.local` (gitignorado, no se sube nunca) con las variables reales ya listas — evita tener que copiarlas a mano desde `credentials.local.md` cada vez. Si no existe (por ejemplo, en una máquina nueva), créalo con este formato antes de empezar:

```
ORIGEN_URL=<connection string de Supabase Producción>
DESTINO_URL=<connection string del Azure Postgres nuevo, con ?sslmode=require>
DATABASE_URL=<mismo valor que DESTINO_URL>
POSTGRES_ADMIN_PASSWORD=<la misma password>
```

**Paso 1 — Infraestructura (AKS + PostgreSQL vacío):**
```powershell
az deployment group create `
  --resource-group DEVOPS `
  --template-file infra/main.bicep `
  --parameters postgresAdminPassword='TU_PASSWORD_AQUI'
```
Tarda ~10-15 minutos (AKS es lo que más demora).

**Paso 2 — Esquema + datos reales** (copia el esquema y los datos desde Supabase Producción al Postgres nuevo, preservando ids):
```powershell
node --env-file=infra/scripts/.env.local infra/scripts/migrar-a-azure.js
```

**Paso 3 — Desplegar la aplicación en el clúster nuevo:** sigue el orden de `k8s/README.md` (namespace, configmap con las URLs de deportBack/Inventario-U, secret con `DATABASE_URL`+`TEAM_API_KEY`, deployment, service).

**Paso 4 — Actualizar lo que cambió:**
* La IP pública del nuevo `Service` es distinta — actualiza `postman/api-fastify-aks.postman_environment.json` y `postman/api-fastify-aks.local.postman_environment.json`.
* Avisa al equipo la IP nueva si la estaban usando.

**Importante:** la contraseña de PostgreSQL se pasa como parámetro en el comando, **nunca** se escribe en `main.bicep`.

## Destruir todo (para bajar a $0 real)

```powershell
# Borra AKS (clúster, nodos, discos, Load Balancer, IPs públicas)
az aks delete --resource-group DEVOPS --name kubernet-devops --yes

# Borra el servidor de PostgreSQL
az postgres flexible-server delete --resource-group DEVOPS --name devops1274 --yes
```

Esto es irreversible: se pierden los datos de la base de datos en Azure. No pasa nada — la copia real sigue intacta en Supabase Producción, y `infra/scripts/migrar-a-azure.js` la vuelve a traer completa (ver "Desplegar" arriba). El Resource Group `DEVOPS` en sí queda vacío pero no se borra.

## Diferencias vs. lo creado manualmente por el portal

* No incluye una IP pública fija (ver arriba).
* Las 29+ reglas de alerta recomendadas que Azure sugiere en el asistente del portal no están declaradas aquí — hay que volver a habilitarlas manualmente después de desplegar, o agregarlas al Bicep más adelante si se justifica el esfuerzo.
* **Métricas del plano de control** (`azureMonitorProfile.metrics.controlPlane`): activadas manualmente en el portal, pero el tipo de Bicep de la API `2024-05-01` no reconoce esa propiedad (`BCP037`) — hay que volver a activar el checkbox "Habilitar métricas del plano de control" a mano en el portal después de desplegar, si se quiere ese dato.
* El firewall del servidor de PostgreSQL usa la regla `AllowAll` (0.0.0.0-255.255.255.255) por las mismas razones documentadas en `credentials.local.md` (GitHub Actions/Render/AKS no tienen IP de salida fija).

## Auditoría de fidelidad (15/sep)

Se comparó el Bicep contra la configuración real exportada con `az aks show` / `az postgres flexible-server show`. Coincide en: SKU/tier, versión de Kubernetes, versión de PostgreSQL, tamaño y cantidad de nodos, storage, backup, alta disponibilidad, red pública, **tipo de red (Azure CNI overlay)**, **Load Balancer Standard**, **identidad de carga de trabajo (OIDC + workload identity)**, y **limpiador de imágenes** — todo esto se agregó al Bicep tras la auditoría (antes faltaba). Las únicas diferencias conocidas que quedan son las 3 listadas arriba (IP fija, reglas de alerta, métricas del plano de control), ninguna bloqueante para que la API funcione igual.
