# Manifiestos de Kubernetes (AKS)

> **Obsoleto desde v3.** Esta carpeta documenta el despliegue de la fase 2 (AKS + 3 APIs + Cache/Storage de los otros equipos). A partir de v3 el sistema ya no usa Kubernetes — corre en Azure Container Apps vía Terraform, ver [`terraform/README.md`](../terraform/README.md). Se conserva como referencia histórica, no como el flujo de despliegue vigente.

Clúster AKS `kubernet-devops`, Resource Group `DEVOPS`, región West US. Un componente por carpeta:

| Carpeta | Namespace | Qué es |
|---|---|---|
| [`api-fastify/`](api-fastify/README.md) | `api-fastify` | La API propia (articulo, stock, receta, fabricacion), con IP pública propia |
| [`orchestrator/`](orchestrator/README.md) | `orchestrator` | Orchestrator + Worker — reciben la tarea, la encolan y la despachan a las 3 APIs |
| [`gateway/`](gateway/README.md) | `orchestrator` (mismo del anterior) | Único punto de entrada público del sistema multicloud |

Orden de despliegue de punta a punta: `api-fastify/` primero (es independiente), luego `orchestrator/` (namespace + configmap + secrets antes que nada), y `gateway/` al final porque depende de ese mismo namespace y ConfigMap. Cada carpeta documenta sus propios comandos.
