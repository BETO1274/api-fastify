# Manifiestos de Kubernetes — Orchestrator + Worker

Namespace `orchestrator`, en el mismo clúster AKS que la API (`kubernet-devops`). El `gateway` que comparte namespace y ConfigMap vive en su propia carpeta, [`k8s/gateway/`](../gateway/README.md).

| Deployment | Réplicas | Qué es | Service |
|---|---|---|---|
| `orchestrator` | 2 | API que guarda la tarea y la encola | `ClusterIP` (solo interno) |
| `worker` | 2 | Consumidor de la cola; despacha a las 3 APIs y a la Cache de deportBack | ninguno |

`orchestrator` y `worker` usan la misma imagen (`orchestrator-produccion`); el worker solo cambia el `command`.

**Por qué el orquestador es `ClusterIP`:** reenvía a las 3 APIs con la `TEAM_API_KEY`. Si tuviera IP pública y no exigiera key, cualquiera podría escribir y borrar datos en las 3 APIs. Solo el gateway debe poder llamarlo.

## Requisitos previos

1. El clúster AKS y PostgreSQL ya creados (`infra/README.md`, pasos 1 y 2).
2. La cola de Service Bus, creada por el mismo `infra/main.bicep`.
3. La tabla `orquestador_tarea` aplicada en esa base de datos (ver "Base de datos" abajo).
4. Las imágenes `ghcr.io/beto1274/orchestrator-produccion` y `gateway-produccion` publicadas (las sube el pipeline de Producción).

## Orden de aplicación

```bash
kubectl apply -f k8s/orchestrator/namespace.yaml
kubectl apply -f k8s/orchestrator/configmap.yaml
# ghcr-pull-secret y orchestrator-secrets se crean aparte (ver abajo)
kubectl apply -f k8s/orchestrator/deployment.yaml
kubectl apply -f k8s/orchestrator/service.yaml
kubectl apply -f k8s/orchestrator/worker-deployment.yaml
kubectl apply -f k8s/gateway/deployment.yaml
kubectl apply -f k8s/gateway/service.yaml
```

## Secrets (los reales nunca se versionan)

Los Secrets son por namespace, así que hay que crearlos también aquí, aunque ya existan en `api-fastify`.

**Acceso a la imagen privada de ghcr.io** (necesita un Personal Access Token nuevo con scope `read:packages`):
```bash
kubectl create secret docker-registry ghcr-pull-secret --namespace orchestrator \
  --docker-server=ghcr.io --docker-username=BETO1274 \
  --docker-password="TU_PERSONAL_ACCESS_TOKEN" --docker-email="tu-correo@ejemplo.com"
```

**Credenciales de la aplicación** — copia `secret.example.yaml` a `secret.local.yaml` (gitignorado), completa los valores reales y aplícalo:
```bash
cp k8s/orchestrator/secret.example.yaml k8s/orchestrator/secret.local.yaml
# editar secret.local.yaml
kubectl apply -f k8s/orchestrator/secret.local.yaml
```

Dónde sale cada valor:
* `DATABASE_URL`: la del PostgreSQL de Azure (`credentials.local.md`).
* `TEAM_API_KEY`: la key compartida del equipo (`credentials.local.md`).
* `SERVICEBUS_CONNECTION_STRING`: se obtiene del namespace que creó el Bicep:
  ```powershell
  $ns = az deployment group show -g DEVOPS -n main --query properties.outputs.serviceBusNamespace.value -o tsv
  az servicebus namespace authorization-rule keys list -g DEVOPS --namespace-name $ns `
    --name RootManageSharedAccessKey --query primaryConnectionString -o tsv
  ```

## Base de datos

La tabla `orquestador_tarea` va en la misma base de Azure que usa la API. Se aplica una vez, desde tu máquina:
```bash
cd orchestrator
DATABASE_URL="postgresql://...azure...?sslmode=require" npm run db:init
```
Es idempotente.

## Verificar

```bash
kubectl get pods -n orchestrator          # 6 pods en Running (2 gateway, 2 orchestrator, 2 worker)
kubectl get service -n orchestrator       # gateway con EXTERNAL-IP; orchestrator solo CLUSTER-IP
curl http://<IP-del-gateway>/health
curl -H "X-Api-Key: <la key>" http://<IP-del-gateway>/api_fastify/articulos/1
```

Un `GET` por el gateway devuelve `202` con el id de una tarea; `GET /orquestar/<id>` muestra el resultado cuando el worker la termina. El orquestador **no** debe responder desde fuera del clúster.

## Costo

El `Service` `gateway` de tipo `LoadBalancer` agrega una **segunda IP pública** al clúster (~$3.65/mes mientras exista, incluso con el clúster detenido; ver "Destruir todo" en `infra/README.md`).
