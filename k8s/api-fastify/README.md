# Manifiestos de Kubernetes — api-fastify

Namespace `api-fastify`, en el clúster AKS (`kubernet-devops`, Resource Group `DEVOPS`, región West US). Es la API propia (`articulo`, `stock`, `receta`, `fabricacion`, v1 y v2), con `Service` tipo `LoadBalancer` (IP pública) — requisito de la Fase 1: debe poder consultarse de forma independiente, sin pasar por el gateway.

## Orden de aplicación

```bash
kubectl apply -f k8s/api-fastify/namespace.yaml
kubectl apply -f k8s/api-fastify/configmap.yaml
# secret.local.yaml y ghcr-pull-secret se aplican aparte (ver secciones de abajo)
kubectl apply -f k8s/api-fastify/deployment.yaml
kubectl apply -f k8s/api-fastify/service.yaml
```

## Secret (nunca versionado con valores reales)

`secret.example.yaml` es solo una plantilla de referencia. El Secret real se crea de forma imperativa, directo desde la terminal, para que la contraseña nunca quede escrita en ningún archivo del repo:

```bash
kubectl create secret generic api-fastify-secrets `
  --namespace api-fastify `
  --from-literal=DATABASE_URL="postgresql://apiadmin:TU_PASSWORD_REAL@devops1274.postgres.database.azure.com:5432/postgres?sslmode=require" `
  --from-literal=TEAM_API_KEY="LA_KEY_COMPARTIDA_CON_EL_EQUIPO"
```

Si necesitas actualizarlo después (por ejemplo, cambió la contraseña):

```bash
kubectl delete secret api-fastify-secrets --namespace api-fastify
kubectl create secret generic api-fastify-secrets --namespace api-fastify --from-literal=DATABASE_URL="..."
```

## Secret de acceso a ghcr.io (imagen privada)

El paquete `ghcr.io/beto1274/api-fastify-produccion` es privado, así que el clúster necesita credenciales para poder hacer *pull* de la imagen. Se crea un Personal Access Token de GitHub (scope `read:packages`) y, con él, el Secret de tipo `docker-registry`:

```bash
kubectl create secret docker-registry ghcr-pull-secret `
  --namespace api-fastify `
  --docker-server=ghcr.io `
  --docker-username=BETO1274 `
  --docker-password="TU_PERSONAL_ACCESS_TOKEN" `
  --docker-email="tu-correo@ejemplo.com"
```

Referenciado en el Deployment vía `spec.template.spec.imagePullSecrets`. Si el token expira o se revoca, hay que regenerarlo y recrear este Secret (`kubectl delete secret ghcr-pull-secret --namespace api-fastify` + volver a crearlo).
