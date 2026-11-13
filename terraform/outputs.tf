output "resource_group_name" {
  description = "Nombre del Resource Group creado"
  value       = module.azure_platform.resource_group_name
}

output "aks_cluster_name" {
  description = "Nombre del clúster AKS (para az aks get-credentials)"
  value       = module.azure_platform.aks_cluster_name
}

output "postgres_host" {
  description = "FQDN del servidor de PostgreSQL"
  value       = module.azure_platform.postgres_host
}

output "database_url" {
  description = "Cadena de conexión a PostgreSQL (se inyecta como Secret de Kubernetes)"
  value       = module.azure_platform.database_url
  sensitive   = true
}

output "servicebus_namespace" {
  description = "Nombre del namespace de Service Bus"
  value       = module.azure_platform.servicebus_namespace
}

output "servicebus_connection_string" {
  description = "Cadena de conexión de Service Bus (se inyecta como Secret de Kubernetes)"
  value       = module.azure_platform.servicebus_connection_string
  sensitive   = true
}

output "log_analytics_workspace_id" {
  description = "Id del Log Analytics Workspace"
  value       = module.azure_platform.log_analytics_workspace_id
}

output "monitor_workspace_id" {
  description = "Id del Azure Monitor Workspace (Prometheus administrado)"
  value       = module.azure_platform.monitor_workspace_id
}
