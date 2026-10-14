output "resource_group_name" {
  description = "Nombre del Resource Group creado"
  value       = azurerm_resource_group.principal.name
}

output "postgres_host" {
  description = "FQDN del servidor de PostgreSQL"
  value       = azurerm_postgresql_flexible_server.principal.fqdn
}

output "servicebus_namespace" {
  description = "Nombre del namespace de Service Bus"
  value       = azurerm_servicebus_namespace.principal.name
}

output "log_analytics_workspace_id" {
  description = "Id del Log Analytics Workspace"
  value       = azurerm_log_analytics_workspace.principal.id
}

output "monitor_workspace_id" {
  description = "Id del Azure Monitor Workspace (Prometheus administrado)"
  value       = azurerm_monitor_workspace.principal.id
}

output "api_fastify_url" {
  description = "URL pública de api-fastify"
  value       = "https://${azurerm_container_app.api_fastify.latest_revision_fqdn}"
}

output "gateway_url" {
  description = "URL pública del gateway — el único punto de entrada del sistema"
  value       = "https://${azurerm_container_app.gateway.latest_revision_fqdn}"
}
