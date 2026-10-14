# ── gateway ──
# Único punto de entrada público del sistema — se despliega al final porque
# depende de conocer el nombre interno del orchestrator.

resource "azurerm_container_app" "gateway" {
  name                         = "gateway"
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
    name  = "team-api-key"
    value = var.team_api_key
  }

  template {
    min_replicas = 1
    max_replicas = 2

    container {
      name   = "gateway"
      image  = var.gateway_image
      cpu    = 0.25
      memory = "0.5Gi"

      env {
        name        = "TEAM_API_KEY"
        secret_name = "team-api-key"
      }
      env {
        name  = "ORQUESTADOR_URL"
        value = "http://${azurerm_container_app.orchestrator.name}"
      }
      env {
        name  = "PORT"
        value = "3200"
      }
    }
  }

  ingress {
    external_enabled = true
    target_port      = 3200
    transport        = "auto"
    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }
}
