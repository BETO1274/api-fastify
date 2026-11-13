#!/usr/bin/env bash
# Reversión inmediata de TODO fallo inyectado en nuestros namespaces:
#   1. borra los experimentos de Chaos Mesh (Chaos Mesh retira la inyección);
#   2. apaga el interruptor propio de latencia en todas las réplicas;
#   3. verifica que no quedó nada activo.
#
# Es idempotente: se puede lanzar aunque no haya nada que revertir. Sale con
# código distinto de 0 si algo quedó activo o no se pudo comprobar, para que
# el experimento y el chaos gate no den por revertido un fallo que sigue vivo.
#
#   bash chaos/revertir.sh
#
# Variable opcional: NAMESPACES (por defecto "api-fastify orchestrator").

set -uo pipefail

NAMESPACES="${NAMESPACES:-api-fastify orchestrator}"
DIRECTORIO="$(cd "$(dirname "$0")" && pwd)"
TIPOS="networkchaos podchaos stresschaos httpchaos"
estado=0

echo "== 1/3 Borrando experimentos de Chaos Mesh =="
for ns in ${NAMESPACES}; do
  for tipo in ${TIPOS}; do
    salida="$(kubectl delete "${tipo}" --all -n "${ns}" --ignore-not-found 2>&1)" || {
      # Si Chaos Mesh no está instalado, el tipo no existe: no hay nada que borrar.
      case "${salida}" in
        *"doesn't have a resource type"*|*"the server doesn't have"*) continue ;;
      esac
      echo "ERROR borrando ${tipo} en ${ns}: ${salida}" >&2
      estado=1
      continue
    }
    [ -n "${salida}" ] && echo "${salida}"
  done
done

echo "== 2/3 Apagando el interruptor propio de latencia =="
bash "${DIRECTORIO}/latencia-saliente.sh" desactivar || estado=1

echo "== 3/3 Verificando que no quedó nada activo =="
for ns in ${NAMESPACES}; do
  for tipo in ${TIPOS}; do
    restantes="$(kubectl get "${tipo}" -n "${ns}" -o name 2>/dev/null || true)"
    if [ -n "${restantes}" ]; then
      echo "AÚN ACTIVO en ${ns}: ${restantes}" >&2
      estado=1
    fi
  done
done

if [ "${estado}" -eq 0 ]; then
  echo "Reversión completa: no queda ningún fallo inyectado."
else
  echo "REVERSIÓN INCOMPLETA: revisa los mensajes anteriores." >&2
fi
exit "${estado}"
