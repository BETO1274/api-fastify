# Variables de entrada — un archivo aparte, para no mezclarlas con los
# recursos de cada servicio.

variable "location" {
  description = "Región de Azure para todos los recursos"
  type        = string
  default     = "westus"
}

variable "resource_group_name" {
  description = "Nombre del Resource Group (lo crea este Terraform)"
  type        = string
  default     = "DEVOPS"
}

variable "postgres_server_name" {
  description = "Nombre del servidor de PostgreSQL (único globalmente)"
  type        = string
  default     = "devops1274"
}

variable "postgres_admin_user" {
  description = "Usuario administrador de PostgreSQL"
  type        = string
  default     = "apiadmin"
}

variable "postgres_admin_password" {
  description = "Password del administrador de PostgreSQL — nunca lo pongas en este archivo, pásalo con -var o TF_VAR_postgres_admin_password"
  type        = string
  sensitive   = true
}

variable "aks_cluster_name" {
  description = "Nombre del clúster AKS"
  type        = string
  default     = "kubernet-devops"
}

variable "aks_dns_prefix" {
  description = "DNS prefix del clúster AKS"
  type        = string
  default     = "kubernet-devops-dns"
}

variable "aks_node_count" {
  description = "Cantidad de nodos del node pool"
  type        = number
  default     = 2
}

variable "aks_node_vm_size" {
  description = "Tamaño de VM de los nodos (x64 — compatible con la imagen Docker de las apps)"
  type        = string
  default     = "Standard_D2s_v6"
}

variable "servicebus_namespace_name" {
  description = "Nombre del namespace de Service Bus (único globalmente)"
  type        = string
  default     = "" # si queda vacío, se genera uno único en servicebus.tf
}

variable "servicebus_queue_name" {
  description = "Nombre de la cola de tareas del orquestador"
  type        = string
  default     = "tareas-orquestador"
}

variable "servicebus_max_delivery_count" {
  description = "Intentos de entrega antes de mandar un mensaje a la dead-letter queue — debe coincidir con SERVICEBUS_MAX_DELIVERY_COUNT en k8s/orchestrator/configmap.yaml"
  type        = number
  default     = 3
}

variable "tags" {
  description = "Tags comunes aplicados a todos los recursos"
  type        = map(string)
  default = {
    proyecto = "API Produccion y Materiales"
    fase     = "v3-terraform"
  }
}
