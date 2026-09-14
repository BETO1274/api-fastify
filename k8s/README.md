# Manifiestos de Kubernetes (AKS)

Esta carpeta contiene los manifiestos versionados que definen cómo se despliega la API en el clúster AKS (`kubernet-devops`, Resource Group `DEVOPS`, región West US).

## Orden de aplicación

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
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
