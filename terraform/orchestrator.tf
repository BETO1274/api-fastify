# ── orchestrator ──
# Sin ingress externo: solo el gateway debe poder llamarlo (misma razón que
# en la Fase 2 con el Service ClusterIP).

resource "azurerm_container_app" "orchestrator" {
  name                         = "orchestrator"
  container_app_environment_id = azurerm_container_app_environment.principal.id
  resource_group_name          = azurerm_resource_group.principal.name
  revision_mode                = "Single"
  tags                         = var.tags

  registry {
    server               = "ghcr.io"
    username             = var.ghcr_username
    password_secret_name = "ghcr-token"
  }

  secret {
    name  = "ghcr-token"
    value = var.ghcr_token
  }
  secret {
    name  = "database-url"
    value = local.database_url
  }
  secret {
    name  = "team-api-key"
    value = var.team_api_key
  }
  secret {
    name  = "servicebus-connection-string"
    value = azurerm_servicebus_namespace.principal.default_primary_connection_string
  }

  template {
    min_replicas = 1
    max_replicas = 2

    container {
      name   = "orchestrator"
      image  = var.orchestrator_image
      cpu    = 0.25
      memory = "0.5Gi"

      env {
        name        = "DATABASE_URL"
        secret_name = "database-url"
      }
      env {
        name        = "TEAM_API_KEY"
        secret_name = "team-api-key"
      }
      env {
        name        = "SERVICEBUS_CONNECTION_STRING"
        secret_name = "servicebus-connection-string"
      }
      env {
        name  = "SERVICEBUS_QUEUE_NAME"
        value = var.servicebus_queue_name
      }
      env {
        name  = "SERVICEBUS_MAX_DELIVERY_COUNT"
        value = tostring(var.servicebus_max_delivery_count)
      }
      env {
        name  = "API_FASTIFY_URL"
        value = "http://${azurerm_container_app.api_fastify.name}"
      }
      env {
        name  = "PORT"
        value = "3100"
      }
    }
  }

  ingress {
    external_enabled = false
    target_port      = 3100
    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }
}
