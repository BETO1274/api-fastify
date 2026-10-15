# Infraestructura como código (Terraform) — v3

Recrea en Azure los servicios de nube que usa el sistema: **Resource Group, PostgreSQL Flexible Server (la base de datos), Azure Container Apps (donde corren api-fastify, Gateway, Orchestrator y Worker), Azure Service Bus (la cola), y el stack de monitoreo (Log Analytics + Azure Monitor Workspace/Prometheus)**. Reemplaza al `infra/main.bicep` de la fase 2 — esta carpeta es la versión vigente para desplegar/destruir la infraestructura de aquí en adelante.

A diferencia de la fase 2, ya no hay conexión con las APIs de los otros equipos (deportBack, Inventario-U) — el sistema queda acotado a: **api-fastify, Gateway, Orchestrator, Worker, la cola y la base de datos**, todo contra la misma nube.

Esta versión tampoco usa Kubernetes: en vez de AKS, los 4 componentes corren en **Azure Container Apps**, una plataforma serverless de contenedores — no hay nodos, clúster ni manifiestos `kubectl` que administrar. El propio Terraform deja los contenedores corriendo al terminar el `apply`.

## Estructura: un módulo por nube, un archivo por servicio dentro del módulo

Esta carpeta sigue el mismo patrón que el ejemplo de referencia de la cátedra (root `main.tf` que invoca módulos) — con la diferencia de que, al usar una sola nube, hay **un solo módulo** (`modules/azure-platform/`) en vez de uno por proveedor. Dentro de ese módulo, los recursos siguen repartidos uno por servicio (eso no lo tiene el ejemplo de referencia, que mete todos los recursos de cada nube en un único `main.tf` por módulo).

**Raíz** (`terraform/`):

| Archivo | Qué hace |
|---|---|
| `main.tf` | Invoca `module "azure_platform"` — el único módulo de este proyecto |
| `versions.tf` | Versión de Terraform, providers requeridos (`azurerm`, `random`), backend remoto |
| `providers.tf` | Configuración del provider `azurerm` (separada de `versions.tf`) |
| `variables.tf` | Variables de entrada, pasadas al módulo |
| `outputs.tf` | Reenvía las salidas del módulo (host de Postgres, URLs públicas, etc.) |

**Módulo** (`terraform/modules/azure-platform/`):

| Archivo | Qué crea |
|---|---|
| `versions.tf` | Providers que necesita el módulo (sin backend ni bloque `provider`, eso solo va en la raíz) |
| `variables.tf` | Variables que recibe el módulo desde la raíz |
| `resource_group.tf` | El Resource Group |
| `postgres.tf` | PostgreSQL Flexible Server + regla de firewall (**la base de datos**) |
| `servicebus.tf` | El namespace de Service Bus + la cola `tareas-orquestador` |
| `monitoring.tf` | Log Analytics Workspace + Azure Monitor Workspace (Prometheus administrado) |
| `container_apps_environment.tf` | El Container Apps Environment (la red compartida que usan los 4 Container Apps) |
| `api_fastify.tf` | El Container App de api-fastify |
| `orchestrator.tf` | El Container App del orchestrator |
| `worker.tf` | El Container App del worker |
| `gateway.tf` | El Container App del gateway |
| `outputs.tf` | Las salidas que la raíz reenvía hacia afuera |

Solo manejamos un ambiente (el de la sustentación), así que no hay una carpeta `environments/` con varios `.tfvars` — un único `terraform.tfvars.example` en la raíz es suficiente.

## Requisitos previos

* [Terraform](https://developer.hashicorp.com/terraform/install) >= 1.5.
* Azure CLI (`az`) instalado y autenticado (`az login`) — Terraform reutiliza esa sesión, no pide credenciales aparte.
* El Resource Group `DEVOPS` **no** debe existir todavía (este Terraform lo crea; si ya existe con ese nombre, falla al aplicar).
* Un storage account para el estado remoto de Terraform (ver "Estado remoto" abajo) — **una sola vez**, no en cada deploy.

## Estado remoto (una sola vez, antes del primer `terraform init`)

El estado de Terraform (qué existe y con qué configuración) se guarda en un Storage Account aparte — así el pipeline de `destroy` sabe qué borrar aunque corra en una máquina nueva de GitHub Actions, sin depender de un `terraform.tfstate` local (que además nunca se commitea, con toda razón: tiene datos sensibles).

```bash
# Resource group aparte, para que sobreviva aunque se destruya el de la app
az group create --name DEVOPS-tfstate --location westus

# El nombre debe ser único globalmente — cambia el sufijo si falla
az storage account create --name tfstatedevops1274 --resource-group DEVOPS-tfstate --sku Standard_LRS --allow-blob-public-access false

az storage container create --name tfstate --account-name tfstatedevops1274 --auth-mode login
```

Guarda el nombre del storage account (`tfstatedevops1274` en el ejemplo) — lo necesitas en el `init` de abajo y en los secrets del pipeline (`TF_STATE_STORAGE_ACCOUNT`).

## Desplegar

1. Copia `terraform.tfvars.example` a `terraform.tfvars` (gitignorado — nunca subas la contraseña ni los tokens reales al repo) y completa `postgres_admin_password`, `ghcr_token` y `team_api_key`.
2. Inicializa, apuntando al estado remoto (reemplaza el nombre del storage account por el que creaste arriba):
   ```bash
   cd terraform
   terraform init \
     -backend-config="resource_group_name=DEVOPS-tfstate" \
     -backend-config="storage_account_name=tfstatedevops1274" \
     -backend-config="container_name=tfstate" \
     -backend-config="key=api-fastify.tfstate" \
     -backend-config="use_azuread_auth=true"
   ```
3. Revisa el plan antes de aplicar:
   ```bash
   terraform plan
   ```
4. Aplica en dos fases, porque los Container Apps necesitan que Postgres ya tenga el esquema aplicado antes de arrancar:
   ```bash
   # Fase 1: todo menos los Container Apps
   terraform apply \
     -target=module.azure_platform.azurerm_resource_group.principal \
     -target=module.azure_platform.azurerm_postgresql_flexible_server.principal \
     -target=module.azure_platform.azurerm_postgresql_flexible_server_firewall_rule.permitir_todo \
     -target=module.azure_platform.azurerm_servicebus_namespace.principal \
     -target=module.azure_platform.azurerm_servicebus_queue.tareas_orquestador \
     -target=module.azure_platform.azurerm_log_analytics_workspace.principal \
     -target=module.azure_platform.azurerm_monitor_workspace.principal \
     -target=module.azure_platform.azurerm_container_app_environment.principal

   # Aplica el esquema y migra los datos (ver infra/scripts/migrar-a-azure.js
   # y orchestrator/scripts/aplicar-esquema.js) usando el host que imprime:
   terraform output -raw postgres_host

   # Fase 2: ya con la base lista, crea los 4 Container Apps
   terraform apply
   ```
   Al terminar, `terraform output -raw api_fastify_url` y `terraform output -raw gateway_url` dan las URLs públicas — no hace falta `kubectl` ni sacar credenciales de ningún clúster, el `apply` deja la API corriendo.

(el pipeline `terraform-deploy.yml` automatiza todo el paso 4, ver más abajo).

## Pipeline automatizado

`.github/workflows/terraform-deploy.yml` corre el `apply` en dos fases descrito arriba, migra la base de datos entre medio, y deja los 4 Container Apps corriendo — todo en un solo flujo manual (`workflow_dispatch`), para no desplegar infraestructura por accidente en cada push. Requiere estos secrets configurados en el repo (Settings → Secrets and variables → Actions):

* `AZURE_CREDENTIALS` — credenciales de un Service Principal con permiso sobre la suscripción, en formato `--sdk-auth`:
  ```bash
  az ad sp create-for-rbac --name sp-terraform-devops --role Contributor \
    --scopes /subscriptions/<TU_SUBSCRIPTION_ID> --sdk-auth
  ```
  El JSON completo que imprime ese comando es el valor del secret.
* `POSTGRES_ADMIN_PASSWORD` — la contraseña de PostgreSQL.
* `TEAM_API_KEY` — la key compartida que ya usan el gateway y el orquestador.
* `MIGRATION_DB_URL_PROD` — connection string de Supabase Producción (de donde se copian los datos reales), el mismo que ya usa `pipeline-produccion.yml`.
* `TF_STATE_RESOURCE_GROUP`, `TF_STATE_STORAGE_ACCOUNT`, `TF_STATE_CONTAINER` — los 3 valores del storage account que creaste en "Estado remoto" arriba.

El `GITHUB_TOKEN` que ya provee Actions automáticamente se reutiliza como `ghcr_token` para que los Container Apps puedan hacer pull de las imágenes privadas de ghcr.io — no hace falta un Personal Access Token aparte para esto.

## Destruir (al terminar la sustentación)

```bash
cd terraform
# Si es una terminal nueva (no corriste "terraform init" en esta sesión antes):
terraform init \
  -backend-config="resource_group_name=DEVOPS-tfstate" \
  -backend-config="storage_account_name=tfstatedevops1274" \
  -backend-config="container_name=tfstate" \
  -backend-config="key=api-fastify.tfstate" \
  -backend-config="use_azuread_auth=true"

terraform destroy \
  -var="postgres_admin_password=<la-misma-que-usaste-en-el-apply>" \
  -var="ghcr_token=<un-token-valido-con-read:packages>" \
  -var="team_api_key=<la-misma-que-usaste-en-el-apply>"
```

Pide confirmación (`yes`) antes de borrar. Esto elimina **todo** lo que creó este Terraform: los 4 Container Apps y su Environment, PostgreSQL, Service Bus, y el stack de monitoreo — deja la suscripción en $0.

No hay pérdida real de datos: la copia de la base de datos sigue intacta en Supabase Producción, y `infra/scripts/migrar-a-azure.js` la vuelve a traer completa la próxima vez que se despliegue.

Para destruirlo sin tener la carpeta a mano (por ejemplo, justo después de la sustentación, desde cualquier máquina), el pipeline también expone un job de destrucción manual — ver `.github/workflows/terraform-destroy.yml`, se dispara desde la pestaña Actions de GitHub con **Run workflow**.

## Diferencias vs. el Bicep de la fase 2

* Este Terraform **crea** el Resource Group (el Bicep asumía que ya existía). Ciclo de vida más simple: `apply` lo crea todo, `destroy` lo borra todo.
* Ya no usa Kubernetes: en vez de AKS corre en Azure Container Apps, así que no hay clúster, nodos ni manifiestos `kubectl` — los secrets `AKS_*` y la carpeta `k8s/` quedaron obsoletos para este despliegue.
* La URL pública cambia con cada recreación (el FQDN del Container App es distinto cada vez). Actualiza `postman/api-fastify-aks.postman_environment.json` y `postman/gateway.postman_environment.json` con los valores de `terraform output api_fastify_url` / `gateway_url` después de cada despliegue.
* No declara las 29+ reglas de alerta recomendadas que sugiere el asistente del portal — si se quieren, se agregan a mano después del despliegue, igual que en la fase 2.
