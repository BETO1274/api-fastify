# ── api-fastify ──
# Único componente con ingress público aparte del gateway — requisito de la
# Fase 1: la API debe poder consultarse de forma independiente.

resource "azurerm_container_app" "api_fastify" {
  name                         = "api-fastify"
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

  template {
    min_replicas = 1
    max_replicas = 2

    container {
      name   = "api-fastify"
      image  = var.api_fastify_image
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
        name  = "PORT"
        value = "3000"
      }

      liveness_probe {
        transport = "HTTP"
        path      = "/health"
        port      = 3000
      }
      readiness_probe {
        transport = "HTTP"
        path      = "/health"
        port      = 3000
      }
    }
  }

  ingress {
    external_enabled = true
    target_port      = 3000
    transport        = "auto" # necesario para que el verbo QUERY no estandar pase sin problema
    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }
}
