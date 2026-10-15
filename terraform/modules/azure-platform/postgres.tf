# Azure Database for PostgreSQL Flexible Server — la base de datos que pide
# la rúbrica explícitamente. Mismo tier gratis (Burstable B1ms) que se usó
# en la fase 2.

resource "azurerm_postgresql_flexible_server" "principal" {
  name                = var.postgres_server_name
  resource_group_name = azurerm_resource_group.principal.name
  location            = azurerm_resource_group.principal.location

  version    = "16"
  sku_name   = "B_Standard_B1ms"
  storage_mb = 32768

  administrator_login    = var.postgres_admin_user
  administrator_password = var.postgres_admin_password

  backup_retention_days         = 7
  geo_redundant_backup_enabled  = false
  public_network_access_enabled = true

  tags = var.tags

  lifecycle {
    ignore_changes = [zone]
  }
}

# Firewall abierto a cualquier IP — GitHub Actions, Render y AKS no tienen
# IP de salida fija (mismo motivo documentado en la fase 2, ver
# credentials.local.md).
resource "azurerm_postgresql_flexible_server_firewall_rule" "permitir_todo" {
  name             = "AllowAll"
  server_id        = azurerm_postgresql_flexible_server.principal.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "255.255.255.255"
}
