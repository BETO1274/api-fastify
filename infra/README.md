# Infraestructura como código (Bicep)

Este archivo (`main.bicep`) recrea la infraestructura de Azure que usamos para la fase 2 (multicloud): el servidor de PostgreSQL (tier gratis) y el clúster AKS con monitoreo nativo (Container Insights + Prometheus administrado).

No incluye una IP pública fija — al recrear el clúster, el `Service` de Kubernetes obtiene una IP nueva. Hay que actualizar `postman/api-fastify-aks.postman_environment.json` y avisarle al equipo cuando eso pase.

## Requisitos

* Azure CLI (`az`) instalado y autenticado (`az login`).
* El Resource Group `DEVOPS` debe existir (no lo crea este Bicep, es intencional — así no se borra por accidente si algún día se destruyen los recursos de adentro).

## Desplegar (crear todo desde cero)

```powershell
az deployment group create `
  --resource-group DEVOPS `
  --template-file infra/main.bicep `
  --parameters postgresAdminPassword='TU_PASSWORD_AQUI'
```

Tarda aproximadamente 10-15 minutos (AKS es lo que más demora). Al terminar, sigue con el orden de `k8s/README.md` (namespace, configmap, secret, deployment, service) para desplegar la aplicación en el clúster nuevo.

**Importante:** la contraseña se pasa como parámetro en el comando, **nunca** se escribe en `main.bicep`. Usa la misma que ya tienes guardada en `credentials.local.md`, o define una nueva y actualiza `credentials.local.md` y `k8s/secret.local.yaml` después.

## Destruir todo (para bajar a $0 real)

```powershell
# Borra AKS (clúster, nodos, discos, Load Balancer, IPs públicas)
az aks delete --resource-group DEVOPS --name kubernet-devops --yes

# Borra el servidor de PostgreSQL
az postgres flexible-server delete --resource-group DEVOPS --name devops1274 --yes
```

Esto es irreversible: se pierden los datos de la base de datos en Azure (aunque ya tenemos el script de seed y la copia en Supabase Producción como respaldo). El Resource Group `DEVOPS` en sí queda vacío pero no se borra.

## Diferencias vs. lo creado manualmente por el portal

* No incluye una IP pública fija (ver arriba).
* Las 29+ reglas de alerta recomendadas que Azure sugiere en el asistente del portal no están declaradas aquí — hay que volver a habilitarlas manualmente después de desplegar, o agregarlas al Bicep más adelante si se justifica el esfuerzo.
* El firewall del servidor de PostgreSQL usa la regla `AllowAll` (0.0.0.0-255.255.255.255) por las mismas razones documentadas en `credentials.local.md` (GitHub Actions/Render/AKS no tienen IP de salida fija).
