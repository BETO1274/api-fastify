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

variable "ghcr_username" {
  description = "Usuario de GitHub para hacer pull de las imágenes privadas de ghcr.io"
  type        = string
  default     = "BETO1274"
}

variable "ghcr_token" {
  description = "Token con permiso read:packages para hacer pull de ghcr.io — nunca lo pongas en este archivo"
  type        = string
  sensitive   = true
}

variable "team_api_key" {
  description = "Key compartida que exigen el gateway y el orquestador — nunca la pongas en este archivo"
  type        = string
  sensitive   = true
}

variable "api_fastify_image" {
  description = "Imagen de api-fastify a desplegar"
  type        = string
  default     = "ghcr.io/beto1274/api-fastify-produccion:latest"
}

variable "orchestrator_image" {
  description = "Imagen del orchestrator/worker a desplegar (misma imagen, distinto command)"
  type        = string
  default     = "ghcr.io/beto1274/orchestrator-produccion:latest"
}

variable "gateway_image" {
  description = "Imagen del gateway a desplegar"
  type        = string
  default     = "ghcr.io/beto1274/gateway-produccion:latest"
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
  description = "Intentos de entrega antes de mandar un mensaje a la dead-letter queue — debe coincidir con el valor que recibe el Container App del worker (ver modules/azure-platform/worker.tf)"
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
