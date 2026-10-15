# Punto de entrada de la infraestructura: invoca el único módulo de este
# proyecto (una sola nube, Azure). Si en el futuro se agregara otra nube,
# sería un module { source = "./modules/<otra-nube>" } adicional, igual
# que el ejemplo de referencia con gcp-platform/oci-platform.

module "azure_platform" {
  source = "./modules/azure-platform"

  location                = var.location
  resource_group_name     = var.resource_group_name
  postgres_server_name    = var.postgres_server_name
  postgres_admin_user     = var.postgres_admin_user
  postgres_admin_password = var.postgres_admin_password

  servicebus_namespace_name     = var.servicebus_namespace_name
  servicebus_queue_name         = var.servicebus_queue_name
  servicebus_max_delivery_count = var.servicebus_max_delivery_count

  ghcr_username = var.ghcr_username
  ghcr_token    = var.ghcr_token
  team_api_key  = var.team_api_key

  api_fastify_image  = var.api_fastify_image
  orchestrator_image = var.orchestrator_image
  gateway_image      = var.gateway_image

  tags = var.tags
}
