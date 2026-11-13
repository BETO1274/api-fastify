#!/usr/bin/env bash
# Instala Chaos Mesh en el AKS con una configuración mínima y acotada.
#
# Decisiones de seguridad (la rúbrica exige radio de impacto controlado y
# nada administrativo expuesto):
#   * Sin dashboard: no se publica ninguna interfaz de administración. Los
#     experimentos se aplican con kubectl, desde archivos versionados.
#   * Filtro por namespace: Chaos Mesh solo actúa sobre namespaces con la
#     anotación chaos-mesh.org/inject=enabled. Aquí solo se anotan los
#     namespaces del propio sistema; kube-system y chaos-mesh quedan fuera.
#   * Runtime containerd: AKS usa containerd, no Docker.
#
# Uso (con kubectl ya apuntando al clúster):
#   bash chaos/instalar-chaos-mesh.sh
#
# Variables opcionales:
#   CHAOS_MESH_VERSION   versión del chart (por defecto 2.8.8)
#   NAMESPACES_OBJETIVO  namespaces donde se permite inyectar caos
#                        (por defecto "orchestrator api-fastify")

set -euo pipefail

CHAOS_MESH_VERSION="${CHAOS_MESH_VERSION:-2.8.8}"
NAMESPACES_OBJETIVO="${NAMESPACES_OBJETIVO:-orchestrator api-fastify}"

echo "== Instalando Chaos Mesh ${CHAOS_MESH_VERSION} =="
helm repo add chaos-mesh https://charts.chaos-mesh.org >/dev/null
helm repo update >/dev/null

helm upgrade --install chaos-mesh chaos-mesh/chaos-mesh \
  --namespace chaos-mesh --create-namespace \
  --version "${CHAOS_MESH_VERSION}" \
  --set chaosDaemon.runtime=containerd \
  --set chaosDaemon.socketPath=/run/containerd/containerd.sock \
  --set dashboard.create=false \
  --set controllerManager.enableFilterNamespace=true \
  --wait --timeout 10m

echo "== Autorizando la inyección solo en: ${NAMESPACES_OBJETIVO} =="
for ns in ${NAMESPACES_OBJETIVO}; do
  kubectl annotate namespace "${ns}" chaos-mesh.org/inject=enabled --overwrite
done

echo "== Verificación =="
kubectl get pods -n chaos-mesh
kubectl get crd | grep -c 'chaos-mesh.org' | xargs -I{} echo "CRDs de Chaos Mesh registrados: {}"
