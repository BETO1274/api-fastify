# Observabilidad nativa del clúster: Container Insights (logs de los pods)
# y Prometheus administrado (métricas). Se referencian desde aks.tf.

resource "random_string" "sufijo_monitoreo" {
  length  = 8
  special = false
  upper   = false
}

resource "azurerm_log_analytics_workspace" "principal" {
  name                = "law-${var.resource_group_name}-${random_string.sufijo_monitoreo.result}"
  resource_group_name = azurerm_resource_group.principal.name
  location            = azurerm_resource_group.principal.location
  sku                 = "PerGB2018"
  retention_in_days   = 30
  tags                = var.tags
}

resource "azurerm_monitor_workspace" "principal" {
  name                = "amw-${var.resource_group_name}-${random_string.sufijo_monitoreo.result}"
  resource_group_name = azurerm_resource_group.principal.name
  location            = azurerm_resource_group.principal.location
  tags                = var.tags
}
