# Providers que necesita este módulo. El backend y la configuración real
# del provider (bloque "provider") viven en la raíz (terraform/versions.tf
# y terraform/providers.tf) — un módulo hijo no declara ninguno de los dos.

terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}
