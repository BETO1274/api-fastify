# Manifiestos de Kubernetes (AKS)

> **Vigente desde la entrega de Ingeniería del Caos (v5).** El sistema vuelve a correr en AKS: Terraform crea el clúster y el workflow `terraform-deploy.yml` aplica estos manifiestos (ver [`terraform/README.md`](../terraform/README.md)). Los Secrets **no** se aplican desde esta carpeta: el workflow los crea desde los GitHub Secrets, y los `secret.example.yaml` son solo plantillas. Las URLs de `deportBack` e Inventario-U de los `configmap.yaml` son valores de la fase 2 y se actualizarán con las direcciones confirmadas por cada equipo.

Clúster AKS `kubernet-devops`, Resource Group `DEVOPS`, región West US. Un componente por carpeta:

| Carpeta | Namespace | Qué es |
|---|---|---|
| [`api-fastify/`](api-fastify/README.md) | `api-fastify` | La API propia (articulo, stock, receta, fabricacion), con IP pública propia |
| [`orchestrator/`](orchestrator/README.md) | `orchestrator` | Orchestrator + Worker — reciben la tarea, la encolan y la despachan a las 3 APIs |
| [`gateway/`](gateway/README.md) | `orchestrator` (mismo del anterior) | Único punto de entrada público del sistema multicloud |

Orden de despliegue de punta a punta: `api-fastify/` primero (es independiente), luego `orchestrator/` (namespace + configmap + secrets antes que nada), y `gateway/` al final porque depende de ese mismo namespace y ConfigMap. Cada carpeta documenta sus propios comandos.
