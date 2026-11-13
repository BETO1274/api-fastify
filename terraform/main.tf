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

  aks_cluster_name = var.aks_cluster_name
  aks_node_count   = var.aks_node_count
  aks_node_vm_size = var.aks_node_vm_size

  servicebus_namespace_name     = var.servicebus_namespace_name
  servicebus_queue_name         = var.servicebus_queue_name
  servicebus_max_delivery_count = var.servicebus_max_delivery_count

  tags = var.tags
}
