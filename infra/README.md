# Infraestructura como código (Bicep)

Este archivo (`main.bicep`) recrea la infraestructura de Azure que usamos para la fase 2 (multicloud): el servidor de PostgreSQL (tier gratis), el clúster AKS con monitoreo nativo (Container Insights + Prometheus administrado) y el namespace de Azure Service Bus con la cola `tareas-orquestador` (tier Basic, con dead-letter queue).

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
Tarda ~10-15 minutos (AKS es lo que más demora). También crea el namespace de Service Bus y su cola; el nombre del namespace sale en los outputs (`serviceBusNamespace`).

**Paso 2 — Esquema + datos reales** (copia el esquema y los datos desde Supabase Producción al Postgres nuevo, preservando ids):
```powershell
node --env-file=infra/scripts/.env.local infra/scripts/migrar-a-azure.js
```

**Paso 2b — Tabla del orquestador** (una vez, en la misma base de Azure):
```powershell
cd orchestrator
$env:DATABASE_URL = "<la misma DESTINO_URL, con ?sslmode=require>"
npm run db:init
```

**Paso 3 — Desplegar la aplicación en el clúster nuevo:**
* La API: sigue `k8s/api-fastify/README.md` (namespace, configmap con las URLs de deportBack/Inventario-U, secret con `DATABASE_URL`+`TEAM_API_KEY`, deployment, service).
* Orquestador y worker: sigue `k8s/orchestrator/README.md` (incluye cómo sacar la connection string de Service Bus).
* Gateway: sigue `k8s/gateway/README.md` (depende del mismo namespace y configmap del orquestador).

**Paso 4 — Actualizar lo que cambió:**
* La IP pública del nuevo `Service` de la API es distinta — actualiza `postman/api-fastify-aks.postman_environment.json` y `postman/api-fastify-aks.local.postman_environment.json`.
* El `Service` `gateway` también recibe una IP pública nueva: esa es la que hay que pasarle al equipo como punto de entrada.
* Avisa al equipo la IP nueva si la estaban usando.

**Paso 5 — Reactivar lo que el Bicep no cubre (alertas + métricas del plano de control):**

Esto es manual porque el asistente del portal las activa como una acción aparte, no como una propiedad del recurso AKS (ver "Diferencias" más abajo).

*Reglas de alerta recomendadas:*
1. Portal de Azure → busca el servicio **"Monitor"** (no el recurso del clúster) → menú izquierdo **"Alerts"** → **"Recommended alert rules"** (o el ícono ⚡ "Discover more insights and configure recommended alert rules").
2. En el selector de recurso, elige la suscripción → Resource Group **DEVOPS** → el clúster **kubernet-devops**.
3. Aparece la misma pantalla que viste al crear el clúster (reglas de la comunidad de Prometheus, métricas de plataforma, fin de soporte de Kubernetes, actualizaciones de NodeOS/clúster) — todas marcadas por defecto.
4. Completa **"Correo electrónico de notificación de alerta"** con tu correo.
5. Clic en **"Create"** / **"Crear"** para aplicar las reglas.

*Métricas del plano de control:*
1. Sobre el recurso del clúster `kubernet-devops` en el portal → menú izquierdo, sección **"Monitoring"** → **"Insights"**.
2. Ícono de engranaje ⚙️ **"Monitor settings"** (arriba a la derecha del panel de Insights).
3. Activa el toggle **"Enable control plane metrics"** / "Habilitar métricas del plano de control" → Guardar.

**Importante:** la contraseña de PostgreSQL se pasa como parámetro en el comando, **nunca** se escribe en `main.bicep`.

## Destruir todo (para bajar a $0 real)

```powershell
# Borra AKS (clúster, nodos, discos, Load Balancer, IPs públicas)
az aks delete --resource-group DEVOPS --name kubernet-devops --yes

# Borra el servidor de PostgreSQL
az postgres flexible-server delete --resource-group DEVOPS --name devops1274 --yes

# Borra el namespace de Service Bus (tier Basic: casi sin costo, pero queda huérfano)
$ns = az servicebus namespace list -g DEVOPS --query "[0].name" -o tsv
az servicebus namespace delete -g DEVOPS -n $ns
```

Esto es irreversible: se pierden los datos de la base de datos en Azure. No pasa nada — la copia real sigue intacta en Supabase Producción, y `infra/scripts/migrar-a-azure.js` la vuelve a traer completa (ver "Desplegar" arriba). El Resource Group `DEVOPS` en sí queda vacío pero no se borra.

**Para $0 total de verdad, también hay que limpiar los residuos huérfanos** que dejan las alertas/Prometheus/monitoreo (no desaparecen solos al borrar el AKS — quedan apuntando a un clúster que ya no existe, y algunos siguen cobrando por evaluación programada):

```powershell
# Todo lo huérfano dentro de DEVOPS, excepto la cuenta de Azure Monitor (se borra aparte)
$ids = az resource list --resource-group DEVOPS --query "[?type != 'microsoft.monitor/accounts'].id" -o tsv
az resource delete --ids $ids

# La cuenta de Azure Monitor (Prometheus)
az resource delete --ids "/subscriptions/<TU_SUBSCRIPTION_ID>/resourceGroups/DEVOPS/providers/microsoft.monitor/accounts/defaultazuremonitorworkspace-wus"

# El Log Analytics Workspace, que Azure crea en un grupo aparte
az resource list --resource-group DefaultResourceGroup-WUS --query "[].id" -o tsv
# copia el id que imprima y bórralo con: az resource delete --ids "<ese id>"
```

Verificación: `az resource list --resource-group DEVOPS` debe devolver vacío.

## Diferencias vs. lo creado manualmente por el portal

* No incluye una IP pública fija (ver arriba).
* La cola de Service Bus sí está en el Bicep, pero **no se probó desplegada** (solo se compiló con `az bicep build`); las pruebas del orquestador se hicieron contra el emulador local.
* Las 29+ reglas de alerta recomendadas que Azure sugiere en el asistente del portal no están declaradas aquí — hay que volver a habilitarlas manualmente después de desplegar, o agregarlas al Bicep más adelante si se justifica el esfuerzo.
* **Métricas del plano de control** (`azureMonitorProfile.metrics.controlPlane`): activadas manualmente en el portal, pero el tipo de Bicep de la API `2024-05-01` no reconoce esa propiedad (`BCP037`) — hay que volver a activar el checkbox "Habilitar métricas del plano de control" a mano en el portal después de desplegar, si se quiere ese dato.
* El firewall del servidor de PostgreSQL usa la regla `AllowAll` (0.0.0.0-255.255.255.255) por las mismas razones documentadas en `credentials.local.md` (GitHub Actions/Render/AKS no tienen IP de salida fija).

## Auditoría de fidelidad (15/sep)

Se comparó el Bicep contra la configuración real exportada con `az aks show` / `az postgres flexible-server show`. Coincide en: SKU/tier, versión de Kubernetes, versión de PostgreSQL, tamaño y cantidad de nodos, storage, backup, alta disponibilidad, red pública, **tipo de red (Azure CNI overlay)**, **Load Balancer Standard**, **identidad de carga de trabajo (OIDC + workload identity)**, y **limpiador de imágenes** — todo esto se agregó al Bicep tras la auditoría (antes faltaba). Las únicas diferencias conocidas que quedan son las 3 listadas arriba (IP fija, reglas de alerta, métricas del plano de control), ninguna bloqueante para que la API funcione igual.
