output "resource_group_name" {
  description = "Nombre del Resource Group creado"
  value       = module.azure_platform.resource_group_name
}

output "postgres_host" {
  description = "FQDN del servidor de PostgreSQL"
  value       = module.azure_platform.postgres_host
}

output "servicebus_namespace" {
  description = "Nombre del namespace de Service Bus"
  value       = module.azure_platform.servicebus_namespace
}

output "log_analytics_workspace_id" {
  description = "Id del Log Analytics Workspace"
  value       = module.azure_platform.log_analytics_workspace_id
}

output "monitor_workspace_id" {
  description = "Id del Azure Monitor Workspace (Prometheus administrado)"
  value       = module.azure_platform.monitor_workspace_id
}

output "api_fastify_url" {
  description = "URL pública de api-fastify"
  value       = module.azure_platform.api_fastify_url
}

output "gateway_url" {
  description = "URL pública del gateway — el único punto de entrada del sistema"
  value       = module.azure_platform.gateway_url
}
