# Azure Container Apps Environment — reemplaza a AKS como el lugar donde
# corren los 4 componentes (api-fastify, gateway, orchestrator, worker).
# Serverless: no hay nodos que administrar, escala a 0 si no se necesita,
# y el Environment ya trae por debajo la red compartida entre apps (DNS
# interno por nombre: http://<nombre-de-la-app>) sin declarar Services aparte.

resource "azurerm_container_app_environment" "principal" {
  name                       = "cae-${var.resource_group_name}"
  resource_group_name        = azurerm_resource_group.principal.name
  location                   = azurerm_resource_group.principal.location
  log_analytics_workspace_id = azurerm_log_analytics_workspace.principal.id
  tags                       = var.tags
}

locals {
  database_url = "postgresql://${var.postgres_admin_user}:${var.postgres_admin_password}@${azurerm_postgresql_flexible_server.principal.fqdn}:5432/postgres?sslmode=require"
}
