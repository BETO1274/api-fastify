# Configuración del provider de Azure (separada de versions.tf, que solo
# declara versiones y el backend). Usa la sesión de `az login` ya activa en
# la máquina — no pide credenciales por separado. Ver terraform/README.md
# para los requisitos previos.

provider "azurerm" {
  features {
    resource_group {
      # Si el grupo llega a tener recursos huérfanos al destruir, no bloquea
      # el "terraform destroy" — los borra junto con el grupo.
      prevent_deletion_if_contains_resources = false
    }
  }
}
