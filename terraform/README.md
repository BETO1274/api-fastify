# Infraestructura como código (Terraform) — v5 (AKS + Ingeniería del Caos)

Recrea en Azure los servicios de nube del sistema: **Resource Group, clúster AKS (donde corren api-fastify, Gateway, Orchestrator y Worker), PostgreSQL Flexible Server (la base de datos), Azure Service Bus (la cola) y el stack de monitoreo (Log Analytics + Azure Monitor Workspace/Prometheus)**.

Terraform solo crea la infraestructura. Los pods los instala el workflow de despliegue con los manifiestos de [`k8s/`](../k8s/README.md), y Chaos Mesh con [`chaos/instalar-chaos-mesh.sh`](../chaos/instalar-chaos-mesh.sh). Se separó así a propósito: declarar recursos de Kubernetes en el mismo `apply` que crea el clúster obliga a que el clúster ya exista para planificar.

## Qué se conserva y qué cambió respecto a la v3

| Pieza | Estado |
|---|---|
| PostgreSQL Flexible Server | Conservada. La base sigue en Azure; el esquema se aplica con `infra/scripts/migrar-a-azure.js` y los datos sintéticos con `seed-produccion.js`. |
| Service Bus + cola `tareas-orquestador` | Conservada (forma parte del flujo del orquestador). |
| Log Analytics + Azure Monitor Workspace | Conservados. |
| Gateway, Orchestrator, Worker, api-fastify | Conservados, pero ahora corren en AKS (antes en Container Apps). |
| Azure Container Apps | **Retirado.** Se reemplazó por AKS para cumplir el requisito de Kubernetes con réplicas, probes y límites. |
| Chaos Mesh | **Nuevo.** Herramienta declarativa de los experimentos de caos. |

## Estructura

**Raíz** (`terraform/`):

| Archivo | Qué hace |
|---|---|
| `main.tf` | Invoca `module "azure_platform"` — el único módulo de este proyecto |
| `versions.tf` | Versión de Terraform, providers requeridos (`azurerm`, `random`), backend remoto |
| `providers.tf` | Configuración del provider `azurerm` |
| `variables.tf` | Variables de entrada, pasadas al módulo |
| `outputs.tf` | Reenvía las salidas del módulo (nombre del clúster, host de Postgres, cadenas de conexión sensibles) |

**Módulo** (`terraform/modules/azure-platform/`):

| Archivo | Qué crea |
|---|---|
| `versions.tf` | Providers que necesita el módulo |
| `variables.tf` | Variables que recibe el módulo desde la raíz |
| `locals.tf` | La cadena de conexión a PostgreSQL |
| `resource_group.tf` | El Resource Group |
| `aks.tf` | El clúster AKS (2 nodos `Standard_D2s_v6`, Container insights) |
| `postgres.tf` | PostgreSQL Flexible Server + regla de firewall (**la base de datos**) |
| `servicebus.tf` | El namespace de Service Bus + la cola `tareas-orquestador` |
| `monitoring.tf` | Log Analytics Workspace + Azure Monitor Workspace (Prometheus administrado) |
| `outputs.tf` | Las salidas que la raíz reenvía hacia afuera |

## Requisitos previos

* [Terraform](https://developer.hashicorp.com/terraform/install) >= 1.5.
* Azure CLI (`az`) autenticado (`az login`).
* El Resource Group `DEVOPS` **no** debe existir todavía (este Terraform lo crea).
* Un storage account para el estado remoto (ver abajo) — **una sola vez**.

## Estado remoto (una sola vez, antes del primer `terraform init`)

El estado se guarda en un Storage Account aparte, para que el pipeline de `destroy` sepa qué borrar aunque corra en una máquina nueva de GitHub Actions.

```bash
# Resource group aparte, para que sobreviva aunque se destruya el de la app
az group create --name DEVOPS-tfstate --location westus

# El nombre debe ser único globalmente — cambia el sufijo si falla
az storage account create --name tfstatedevops1274 --resource-group DEVOPS-tfstate --sku Standard_LRS --allow-blob-public-access false

az storage container create --name tfstate --account-name tfstatedevops1274 --auth-mode login
```

Los nombres que uses van en los secrets `TF_STATE_RESOURCE_GROUP`, `TF_STATE_STORAGE_ACCOUNT` y `TF_STATE_CONTAINER`.

## Desplegar (pipeline automatizado)

`.github/workflows/terraform-deploy.yml` hace todo en un solo flujo manual (`workflow_dispatch`), para no gastar dinero por accidente en cada push:

1. `terraform init`, `validate` y `apply` (AKS, PostgreSQL, Service Bus, monitoreo).
2. Aplica el esquema y siembra los datos sintéticos en PostgreSQL, y crea la tabla del orquestador.
3. Conecta `kubectl` al AKS, crea los namespaces y los Secrets (desde GitHub Secrets y las salidas sensibles de Terraform; nunca desde archivos del repo) y aplica los manifiestos.
4. Instala Chaos Mesh (sin dashboard, solo habilitado en los namespaces `orchestrator` y `api-fastify`).
5. Publica en el resumen del run las direcciones del Gateway y de api-fastify, y la IP de salida del clúster (para los firewalls de los otros equipos).

```bash
gh workflow run terraform-deploy.yml --repo BETO1274/api-fastify --ref produccion

# Para seguirlo en vivo:
gh run list --branch produccion --limit 1
gh run watch <run-id> --exit-status
```

### Secrets requeridos (Settings → Secrets and variables → Actions)

* `ARM_CLIENT_ID`, `ARM_CLIENT_SECRET`, `ARM_TENANT_ID`, `ARM_SUBSCRIPTION_ID` — Service Principal con rol `Contributor` sobre la suscripción:
  ```bash
  az ad sp create-for-rbac --name sp-terraform-devops --role Contributor \
    --scopes /subscriptions/<TU_SUBSCRIPTION_ID>
  ```
  El backend `azurerm` (con `use_azuread_auth=true`) y el provider autentican con estas 4 variables directamente. **No** uses `azure/login@v2` para Terraform: el backend solo acepta autenticación CLI para cuentas de usuario, no para Service Principals. El workflow sí hace `az login` con el Service Principal, pero solo después de Terraform y únicamente para obtener las credenciales del AKS.
  El Service Principal también necesita `Storage Blob Data Contributor` sobre el storage account del estado:
  ```bash
  az role assignment create --assignee-object-id <object-id-del-SP> \
    --assignee-principal-type ServicePrincipal \
    --role "Storage Blob Data Contributor" \
    --scope /subscriptions/<TU_SUBSCRIPTION_ID>/resourceGroups/DEVOPS-tfstate/providers/Microsoft.Storage/storageAccounts/tfstatedevops1274
  ```
* `TF_STATE_RESOURCE_GROUP`, `TF_STATE_STORAGE_ACCOUNT`, `TF_STATE_CONTAINER` — los 3 valores del storage del estado.
* `POSTGRES_ADMIN_PASSWORD` — la contraseña de PostgreSQL.
* `TEAM_API_KEY` — la key compartida entre las tres APIs. Se entrega a los otros equipos por un canal privado, nunca por Git.
* `GHCR_READ_TOKEN` — token de larga duración con `read:packages`, con el que el clúster hace pull de las imágenes privadas de ghcr.io (se guarda como `imagePullSecret` en Kubernetes). **No uses `secrets.GITHUB_TOKEN`**: es efímero y los pods fallarían con `ImagePullBackOff` al reiniciar.

`MIGRATION_DB_URL_PROD` ya no se usa: el Supabase de Producción no existe y los datos son sintéticos.

## Acceso al clúster

```bash
az aks get-credentials --resource-group DEVOPS --name kubernet-devops
kubectl get pods --all-namespaces
```

## Hallazgo de seguridad pendiente (backlog de resiliencia)

El firewall de PostgreSQL (`postgres.tf`, regla `AllowAll`) está abierto a todo internet (`0.0.0.0` a `255.255.255.255`). Se aceptó para esta entrega porque la base contiene solo datos sintéticos, la contraseña es de larga longitud y la infraestructura se destruye al terminar. Una versión endurecida limitaría la regla a la IP de salida del AKS y correría el esquema y la siembra como un Job dentro del clúster.

## Destruir (al terminar la sustentación)

```bash
gh workflow run terraform-destroy.yml --repo BETO1274/api-fastify --ref produccion -f confirmar=destruir
```

El input `confirmar` debe decir exactamente `destruir` (seguro contra disparos accidentales). Elimina **todo** lo que creó este Terraform: el AKS, PostgreSQL, Service Bus y el monitoreo. No se pierde nada real: los datos son sintéticos y se regeneran en cada despliegue. El storage del estado (`DEVOPS-tfstate`) se conserva a propósito.

También se puede destruir a mano:

```bash
cd terraform
terraform init \
  -backend-config="resource_group_name=DEVOPS-tfstate" \
  -backend-config="storage_account_name=tfstatedevops1274" \
  -backend-config="container_name=tfstate" \
  -backend-config="key=api-fastify.tfstate" \
  -backend-config="use_azuread_auth=true"

terraform destroy -var="postgres_admin_password=<la-misma-que-usaste-en-el-apply>"
```

## Notas

* Las direcciones públicas (Gateway y api-fastify) las asigna el LoadBalancer de Kubernetes y cambian con cada despliegue. Se consultan en el resumen del run del workflow o con `kubectl get svc --all-namespaces`.
* Los experimentos de caos usan solo recursos de este clúster, con datos sintéticos y en una ventana acordada con el grupo.
* No se declaran las reglas de alerta que sugiere el asistente del portal de Azure.
