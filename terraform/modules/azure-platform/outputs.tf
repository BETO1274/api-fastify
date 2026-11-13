output "resource_group_name" {
  description = "Nombre del Resource Group creado"
  value       = azurerm_resource_group.principal.name
}

output "aks_cluster_name" {
  description = "Nombre del clúster AKS (para az aks get-credentials)"
  value       = azurerm_kubernetes_cluster.principal.name
}

output "postgres_host" {
  description = "FQDN del servidor de PostgreSQL"
  value       = azurerm_postgresql_flexible_server.principal.fqdn
}

output "database_url" {
  description = "Cadena de conexión a PostgreSQL (se inyecta como Secret de Kubernetes)"
  value       = local.database_url
  sensitive   = true
}

output "servicebus_namespace" {
  description = "Nombre del namespace de Service Bus"
  value       = azurerm_servicebus_namespace.principal.name
}

output "servicebus_connection_string" {
  description = "Cadena de conexión de Service Bus (se inyecta como Secret de Kubernetes)"
  value       = azurerm_servicebus_namespace.principal.default_primary_connection_string
  sensitive   = true
}

output "log_analytics_workspace_id" {
  description = "Id del Log Analytics Workspace"
  value       = azurerm_log_analytics_workspace.principal.id
}

output "monitor_workspace_id" {
  description = "Id del Azure Monitor Workspace (Prometheus administrado)"
  value       = azurerm_monitor_workspace.principal.id
}
