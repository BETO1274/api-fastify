# Versión de Terraform y del provider de Azure.
# Se fija un rango para que el equipo no tenga sorpresas entre máquinas.

terraform {
  required_version = ">= 1.5"

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

  # Estado remoto: así el pipeline de "destruir" (que corre en una máquina
  # nueva de GitHub Actions) sabe qué existe, sin depender de un
  # terraform.tfstate local que nunca se commitea. Los valores reales se
  # pasan con "terraform init -backend-config=..." (ver README) — este
  # bloque queda vacío a propósito, no se hardcodea nada sensible aquí.
  backend "azurerm" {}
}

# Usa la sesión de `az login` ya activa en la máquina — no pide credenciales
# por separado. Ver terraform/README.md para los requisitos previos.
provider "azurerm" {
  features {
    resource_group {
      # Si el grupo llega a tener recursos huérfanos al destruir, no bloquea
      # el "terraform destroy" — los borra junto con el grupo.
      prevent_deletion_if_contains_resources = false
    }
  }
}
