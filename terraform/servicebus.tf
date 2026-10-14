# Azure Service Bus — la cola de tareas que consume el worker. Tier Basic:
# cuesta centavos por millón de operaciones y trae dead-letter queue nativa.

resource "random_string" "sufijo_servicebus" {
  length  = 10
  special = false
  upper   = false
}

resource "azurerm_servicebus_namespace" "principal" {
  name                = var.servicebus_namespace_name != "" ? var.servicebus_namespace_name : "sb-${random_string.sufijo_servicebus.result}"
  resource_group_name = azurerm_resource_group.principal.name
  location            = azurerm_resource_group.principal.location
  sku                 = "Basic"
  tags                = var.tags
}

resource "azurerm_servicebus_queue" "tareas_orquestador" {
  name         = var.servicebus_queue_name
  namespace_id = azurerm_servicebus_namespace.principal.id

  max_delivery_count                   = var.servicebus_max_delivery_count
  lock_duration                        = "PT1M"
  dead_lettering_on_message_expiration = true
  default_message_ttl                  = "P1D"
}
