# Resource Group — a diferencia del Bicep de la fase 2 (que asumía que ya
# existía, a propósito), este Terraform sí lo crea. Es más simple de
# mantener como un único ciclo de vida: "terraform apply" lo crea todo,
# "terraform destroy" lo borra todo, sin pasos manuales de por medio.

resource "azurerm_resource_group" "principal" {
  name     = var.resource_group_name
  location = var.location
  tags     = var.tags
}
