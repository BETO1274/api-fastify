# Punto de entrada de la infraestructura — no declara recursos propios
# (van repartidos en un archivo por servicio, ver terraform/README.md),
# solo deja a la vista el mapa completo de lo que compone el despliegue:
#
#   resource_group.tf                -> Resource Group
#   postgres.tf                      -> PostgreSQL Flexible Server (la base de datos)
#   servicebus.tf                    -> Azure Service Bus (la cola)
#   monitoring.tf                    -> Log Analytics + Azure Monitor Workspace
#   container_apps_environment.tf    -> Azure Container Apps Environment
#   api_fastify.tf                   -> Container App: api-fastify
#   orchestrator.tf                  -> Container App: orchestrator
#   worker.tf                        -> Container App: worker
#   gateway.tf                       -> Container App: gateway
#
# Terraform carga todos los .tf de la carpeta como un solo documento;
# el orden de creación lo resuelve el grafo de dependencias entre
# recursos, no el nombre de los archivos.
