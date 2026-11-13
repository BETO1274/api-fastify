# Valores derivados que comparten varios recursos y salidas del módulo.

locals {
  # Cadena de conexión a PostgreSQL. Se expone como salida sensible para que
  # el workflow de despliegue la inyecte como Secret de Kubernetes: así no
  # viaja por variables ni queda escrita en ningún manifiesto del repo.
  database_url = "postgresql://${var.postgres_admin_user}:${var.postgres_admin_password}@${azurerm_postgresql_flexible_server.principal.fqdn}:5432/postgres?sslmode=require"
}
