# Clúster de Kubernetes (AKS) donde corren api-fastify, el gateway, el
# orquestador y el worker, y donde se instala Chaos Mesh para los
# experimentos de la entrega de Ingeniería del Caos.
#
# Los manifiestos viven en k8s/ y los aplica el workflow de despliegue; este
# Terraform solo crea el clúster. Así el plan de infraestructura no depende
# de que el clúster ya exista (evita el problema huevo-gallina de declarar
# recursos de Kubernetes en el mismo apply que crea el clúster).

resource "azurerm_kubernetes_cluster" "principal" {
  name                = var.aks_cluster_name
  resource_group_name = azurerm_resource_group.principal.name
  location            = azurerm_resource_group.principal.location
  dns_prefix          = var.aks_cluster_name
  sku_tier            = "Free"

  default_node_pool {
    name       = "system"
    node_count = var.aks_node_count
    vm_size    = var.aks_node_vm_size
  }

  identity {
    type = "SystemAssigned"
  }

  # Container insights: logs y métricas de los pods en el Log Analytics
  # Workspace que ya crea monitoring.tf.
  oms_agent {
    log_analytics_workspace_id = azurerm_log_analytics_workspace.principal.id
  }

  tags = var.tags
}
