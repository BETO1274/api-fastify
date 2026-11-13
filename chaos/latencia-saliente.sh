#!/usr/bin/env bash
# Activa, consulta o apaga la latencia saliente de api-fastify hacia las otras
# APIs del grupo (interruptor propio de caos, ver src/common/caos-saliente.js).
#
# Se aplica a TODAS las réplicas de api-fastify: el estado vive en memoria de
# cada una, así que llamar a una sola dejaría la mitad del tráfico sin fallo.
#
# La llamada se hace desde dentro de cada pod (kubectl exec) y la clave se lee
# de su propio entorno: no sale del pod, no se imprime y no hay que exponer
# ningún puerto administrativo.
#
# Uso (con kubectl apuntando al clúster):
#   bash chaos/latencia-saliente.sh activar <servicio> <latencia_ms> <duracion_s>
#   bash chaos/latencia-saliente.sh estado
#   bash chaos/latencia-saliente.sh desactivar
#
#   <servicio>: deportback | inventario_u | todos
#   <duracion_s> es obligatoria (máximo 1800): el fallo vence solo aunque este
#   script o quien lo lanzó muera. "desactivar" es la reversión inmediata.
#
# Sale con código distinto de 0 si alguna réplica no responde bien, para que
# el experimento o el chaos gate lo detecten.

set -euo pipefail

NAMESPACE="${NAMESPACE:-api-fastify}"
ETIQUETA="${ETIQUETA:-app=api-fastify}"

uso() {
  sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
}

llamar_pod() {
  local pod="$1" metodo="$2" cuerpo="${3:-}"
  kubectl exec -n "${NAMESPACE}" "${pod}" -- node -e '
    const [metodo, cuerpo] = process.argv.slice(1)
    const headers = { "x-api-key": process.env.TEAM_API_KEY }
    if (cuerpo) headers["content-type"] = "application/json"
    const url = "http://127.0.0.1:" + (process.env.PORT || 3000) + "/admin/caos-saliente"
    fetch(url, { method: metodo, headers, body: cuerpo || undefined })
      .then(async (r) => { console.log(r.status, await r.text()); process.exit(r.ok ? 0 : 1) })
      .catch((e) => { console.error(e.message); process.exit(1) })
  ' "${metodo}" "${cuerpo}"
}

aplicar_a_todas() {
  local metodo="$1" cuerpo="${2:-}" fallos=0 pods pod
  pods="$(kubectl get pods -n "${NAMESPACE}" -l "${ETIQUETA}" -o jsonpath='{.items[*].metadata.name}')"
  if [ -z "${pods}" ]; then
    echo "No hay pods con la etiqueta ${ETIQUETA} en ${NAMESPACE}" >&2
    exit 1
  fi
  for pod in ${pods}; do
    printf '%s -> ' "${pod}"
    llamar_pod "${pod}" "${metodo}" "${cuerpo}" || fallos=$((fallos + 1))
  done
  if [ "${fallos}" -gt 0 ]; then
    echo "ERROR: ${fallos} réplica(s) no aplicaron el cambio" >&2
    exit 1
  fi
}

accion="${1:-}"
case "${accion}" in
  activar)
    [ "$#" -eq 4 ] || uso
    aplicar_a_todas POST "{\"servicio\":\"$2\",\"latencia_ms\":$3,\"duracion_s\":$4}"
    ;;
  estado)
    aplicar_a_todas GET
    ;;
  desactivar)
    aplicar_a_todas DELETE
    ;;
  *)
    uso
    ;;
esac
