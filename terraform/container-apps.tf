# Azure Container Apps — reemplaza a AKS como el lugar donde corren los 4
# componentes (api-fastify, gateway, orchestrator, worker). Serverless: no
# hay nodos que administrar, escala a 0 si no se necesita, y el Environment
# ya trae por debajo la red compartida entre apps (DNS interno por nombre:
# http://<nombre-de-la-app>) sin tener que declarar Services aparte.

resource "azurerm_container_app_environment" "principal" {
  name                       = "cae-${var.resource_group_name}"
  resource_group_name        = azurerm_resource_group.principal.name
  location                   = azurerm_resource_group.principal.location
  log_analytics_workspace_id = azurerm_log_analytics_workspace.principal.id
  tags                       = var.tags
}

locals {
  database_url = "postgresql://${var.postgres_admin_user}:${var.postgres_admin_password}@${azurerm_postgresql_flexible_server.principal.fqdn}:5432/postgres?sslmode=require"
}

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

# ── worker ──
# Misma imagen que el orchestrator, pero arrancando el consumidor de la
# cola en vez del servidor HTTP — igual que en la Fase 2. Sin ingress: no
# atiende peticiones, solo consume mensajes.
resource "azurerm_container_app" "worker" {
  name                         = "worker"
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
      name    = "worker"
      image   = var.orchestrator_image
      cpu     = 0.25
      memory  = "0.5Gi"
      command = ["node", "src/worker.js"]

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
    }
  }
}

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
