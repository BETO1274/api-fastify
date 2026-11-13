# Variables de entrada del módulo — las pasa terraform/main.tf (raíz) al
# invocar module "azure_platform". Un archivo aparte, para no mezclarlas
# con los recursos de cada servicio.

variable "location" {
  description = "Región de Azure para todos los recursos"
  type        = string
}

variable "resource_group_name" {
  description = "Nombre del Resource Group (lo crea este Terraform)"
  type        = string
}

variable "postgres_server_name" {
  description = "Nombre del servidor de PostgreSQL (único globalmente)"
  type        = string
}

variable "postgres_admin_user" {
  description = "Usuario administrador de PostgreSQL"
  type        = string
}

variable "postgres_admin_password" {
  description = "Password del administrador de PostgreSQL — nunca lo pongas en este archivo, pásalo con -var o TF_VAR_postgres_admin_password"
  type        = string
  sensitive   = true
}

variable "aks_cluster_name" {
  description = "Nombre del clúster AKS"
  type        = string
}

variable "aks_node_count" {
  description = "Cantidad de nodos del clúster (mínimo 2 para repartir las réplicas)"
  type        = number
}

variable "aks_node_vm_size" {
  description = "Tamaño de VM de los nodos del clúster"
  type        = string
}

variable "servicebus_namespace_name" {
  description = "Nombre del namespace de Service Bus (único globalmente)"
  type        = string
  default     = "" # si queda vacío, se genera uno único en servicebus.tf
}

variable "servicebus_queue_name" {
  description = "Nombre de la cola de tareas del orquestador"
  type        = string
}

variable "servicebus_max_delivery_count" {
  description = "Intentos de entrega antes de mandar un mensaje a la dead-letter queue — debe coincidir con SERVICEBUS_MAX_DELIVERY_COUNT de k8s/orchestrator/configmap.yaml"
  type        = number
}

variable "tags" {
  description = "Tags comunes aplicados a todos los recursos"
  type        = map(string)
}
