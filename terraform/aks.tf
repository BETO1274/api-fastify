# Clúster de Kubernetes (AKS) — donde corre api-fastify, el gateway, el
# orquestador y el worker. Misma configuración que se auditó contra el
# Bicep de la fase 2: red Azure CNI overlay, Load Balancer Standard,
# workload identity + OIDC, limpiador de imágenes, y monitoreo nativo
# (Container Insights + Prometheus administrado).

resource "azurerm_kubernetes_cluster" "principal" {
  name                = var.aks_cluster_name
  resource_group_name = azurerm_resource_group.principal.name
  location            = azurerm_resource_group.principal.location
  dns_prefix          = var.aks_dns_prefix
  sku_tier            = "Free"

  default_node_pool {
    name       = "agentpool"
    node_count = var.aks_node_count
    vm_size    = var.aks_node_vm_size
    os_sku     = "Ubuntu"
  }

  identity {
    type = "SystemAssigned"
  }

  network_profile {
    network_plugin      = "azure"
    network_plugin_mode = "overlay"
    load_balancer_sku   = "standard"
  }

  oidc_issuer_enabled       = true
  workload_identity_enabled = true

  image_cleaner_enabled        = true
  image_cleaner_interval_hours = 168

  oms_agent {
    log_analytics_workspace_id = azurerm_log_analytics_workspace.principal.id
  }

  monitor_metrics {
    annotations_allowed = null
    labels_allowed      = null
  }

  tags = var.tags
}
