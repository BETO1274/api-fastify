output "resource_group_name" {
  description = "Nombre del Resource Group creado"
  value       = azurerm_resource_group.principal.name
}

output "aks_cluster_name" {
  description = "Nombre del clúster AKS"
  value       = azurerm_kubernetes_cluster.principal.name
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

output "aks_kube_config_command" {
  description = "Comando para obtener las credenciales del clúster"
  value       = "az aks get-credentials --resource-group ${azurerm_resource_group.principal.name} --name ${azurerm_kubernetes_cluster.principal.name} --overwrite-existing"
}
