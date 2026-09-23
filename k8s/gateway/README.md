# Manifiestos de Kubernetes — Gateway

Único punto de entrada público del sistema multicloud. Vive en el namespace `orchestrator` (mismo `ConfigMap` y Secrets que [`k8s/orchestrator/`](../orchestrator/README.md) — se despliega junto con él, no por separado), pero se mantiene en su propia carpeta por claridad: es un componente distinto (traduce REST → JSON del orquestador, valida `X-Api-Key`, estampa `X-Trace-Id`).

| Deployment | Réplicas | Qué es | Service |
|---|---|---|---|
| `gateway` | 2 | Único punto de entrada público. Valida `X-Api-Key` y reenvía todo al orquestador | `LoadBalancer` (IP pública) |

## Orden de aplicación

Requiere que `k8s/orchestrator/namespace.yaml` y `configmap.yaml` ya estén aplicados (mismo namespace, mismo ConfigMap):

```bash
kubectl apply -f k8s/gateway/deployment.yaml
kubectl apply -f k8s/gateway/service.yaml
```

Ver la secuencia completa, con orchestrator y worker, en [`k8s/orchestrator/README.md`](../orchestrator/README.md#orden-de-aplicación).

## Verificar

```bash
kubectl get pods -n orchestrator -l app=gateway
kubectl get service gateway -n orchestrator     # EXTERNAL-IP pública
curl http://<IP-del-gateway>/health
```
