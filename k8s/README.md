# Manifiestos de Kubernetes (AKS)

Clúster AKS `kubernet-devops`, Resource Group `DEVOPS`, región West US. Un componente por carpeta:

| Carpeta | Namespace | Qué es |
|---|---|---|
| [`api-fastify/`](api-fastify/README.md) | `api-fastify` | La API propia (articulo, stock, receta, fabricacion), con IP pública propia |
| [`orchestrator/`](orchestrator/README.md) | `orchestrator` | Orchestrator + Worker — reciben la tarea, la encolan y la despachan a las 3 APIs |
| [`gateway/`](gateway/README.md) | `orchestrator` (mismo del anterior) | Único punto de entrada público del sistema multicloud |

Orden de despliegue de punta a punta: `api-fastify/` primero (es independiente), luego `orchestrator/` (namespace + configmap + secrets antes que nada), y `gateway/` al final porque depende de ese mismo namespace y ConfigMap. Cada carpeta documenta sus propios comandos.
