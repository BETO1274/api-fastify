#!/usr/bin/env bash
# Promocion progresiva del canary por etapas, con quality gate y rollback.
#
# Uso:  promover.sh [todo | preparar | humo | caos | etapa N | cierre | rollback | limpieza]
#
#   todo       (por defecto) corre todo en un solo proceso, con rollback automatico.
#   preparar   despierta stable y canary (el plan gratis de Render los duerme).
#   humo       etapa 0: 0% publico, prueba de humo con x-canary: true.
#   caos       si INYECTAR_FALLA=true, activa la falla en el canary.
#   etapa N    una etapa de promocion (1..5 = 10, 25, 50, 75 y 100%): sube el peso,
#              genera carga durante el bake, evalua el gate. Si aborta, falla (exit 1).
#   cierre     declara la promocion completa, apaga el caos y limpia los datos de prueba.
#   rollback   peso 0, caos apagado y limpieza. Pensado para correr con "if: failure()".
#   limpieza   apaga el caos y borra los articulos de carga.
#
# Los subcomandos existen para que el workflow muestre cada fase como un paso propio.
# Con MODO_PASOS=true un fallo solo termina el paso (el rollback es otro paso).
#
# Variables:
#   ROUTER_URL, ADMIN_KEY            (obligatorias)
#   STABLE_URL, CANARY_URL           (recomendadas) se despiertan antes de empezar: en el plan
#                                    gratis de Render los servicios hibernan tras ~15 min sin trafico
#   ALLOY_URL                        (opcional) se despierta tambien para que Grafana reciba metricas;
#                                    si no responde solo se avisa, no bloquea la promocion
#   CANARY_TEAM_API_KEY              (solo para INYECTAR_FALLA=true)
#   WARMUP_MAX_SEGUNDOS              espera maxima por servicio al despertarlo (120 por defecto)
#   DEMO=true                        usa los tiempos cortos (demo.bake_segundos) de slo.json
#   BAKE_SEGUNDOS                    fuerza la duracion de cada bake (pruebas locales)
#   SLO_ARCHIVO                      otro archivo de umbrales (pruebas locales)
#   INYECTAR_FALLA=true              activa /admin/caos en el canary para simular una regresion
#   MODO_PASOS=true                  un fallo no hace rollback: lo hace el paso "rollback"
set -uo pipefail

: "${ROUTER_URL:?Falta ROUTER_URL}" "${ADMIN_KEY:?Falta ADMIN_KEY}"
ROUTER_URL="${ROUTER_URL%/}"
DEMO="${DEMO:-true}"
INYECTAR_FALLA="${INYECTAR_FALLA:-false}"
MODO_PASOS="${MODO_PASOS:-false}"
MAX_EXTENSIONES="${MAX_EXTENSIONES:-3}"
WARMUP_MAX_SEGUNDOS="${WARMUP_MAX_SEGUNDOS:-120}"
AQUI="$(cd "$(dirname "$0")" && pwd)"
SLO="${SLO_ARCHIVO:-$AQUI/slo.json}"
TMP="${RUNNER_TEMP:-/tmp}"
ESTADO="$TMP/estado-router.json"
MOTIVO_ARCHIVO="$TMP/motivo-aborto.txt"
RESUMEN="${GITHUB_STEP_SUMMARY:-/dev/null}"

peso() {
  curl -fsS -X POST "$ROUTER_URL/router/weight" \
    -H "x-admin-key: $ADMIN_KEY" -H 'content-type: application/json' \
    -d "{\"canary_weight\":$1}" > /dev/null
}

caos() {
  # $1 = JSON con latencia_ms/tasa_error, o "apagar"
  [ -z "${CANARY_URL:-}" ] && return 0
  if [ "$1" = "apagar" ]; then
    curl -fsS -X DELETE "${CANARY_URL%/}/admin/caos" -H "x-api-key: ${CANARY_TEAM_API_KEY:-}" > /dev/null || true
  else
    curl -fsS -X POST "${CANARY_URL%/}/admin/caos" -H "x-api-key: ${CANARY_TEAM_API_KEY:-}" \
      -H 'content-type: application/json' -d "$1" > /dev/null
  fi
}

# Despierta un servicio con peticiones directas (a /health por defecto) hasta que responda 200.
calentar() {
  local nombre="$1" url="${2%/}" ruta="${3:-/health}" codigo fin=$((SECONDS + WARMUP_MAX_SEGUNDOS))
  while [ "$SECONDS" -lt "$fin" ]; do
    codigo="$(curl -s -o /dev/null -m 30 -w '%{http_code}' "$url$ruta" 2>/dev/null || true)"
    if [ "$codigo" = "200" ]; then
      echo "$nombre listo (HTTP 200)"
      return 0
    fi
    echo "$nombre aun no responde (HTTP ${codigo:-000}), reintentando..."
    sleep 5
  done
  return 1
}

# Imprime "track|codigo" de una peticion al router (track = cabecera X-Routed-To).
sondear() {
  local cabeceras codigo track
  cabeceras="$(mktemp)"
  codigo="$(curl -s -m 30 -o /dev/null -D "$cabeceras" -w '%{http_code}' "$@" 2>/dev/null || true)"
  track="$(tr -d '\r' < "$cabeceras" | grep -i '^x-routed-to:' | awk '{print $2}')"
  rm -f "$cabeceras"
  echo "${track:-?}|${codigo:-000}"
}

# Repite la sonda hasta obtener HTTP 200 (el router puede tardar en alcanzar un servicio recien despierto).
sondear_ok() {
  local resultado intento
  for intento in 1 2 3 4 5 6; do
    resultado="$(sondear "$@")"
    [ "${resultado#*|}" = "200" ] && { echo "$resultado"; return 0; }
    sleep 5
  done
  echo "$resultado"
  return 1
}

limpiar() {
  node "$AQUI/carga.mjs" --router "$ROUTER_URL" --limpiar true || true
}

# Peso 0, resumen, caos apagado y limpieza. No termina el proceso.
hacer_rollback() {
  local motivo="$1"
  peso 0
  echo "Rollback: 0% hacia canary, 100% hacia stable"
  {
    echo "### 🛑 Rollback automatico"
    echo "Motivo: $motivo"
    echo "El router quedo en **0%** hacia canary y **100%** hacia stable."
  } >> "$RESUMEN"
  caos apagar
  limpiar
}

# Modo "todo": avisa, hace el rollback y termina con error.
terminar_con_rollback() {
  echo "::error::ABORTO del canary: $1"
  hacer_rollback "$1"
  exit 1
}

# Falla la fase actual. En modo por pasos el rollback lo hace el paso "rollback".
fallar() {
  if [ "$MODO_PASOS" = "true" ]; then
    echo "::error::$1"
    echo "$1" > "$MOTIVO_ARCHIVO"
    exit 1
  fi
  terminar_con_rollback "$1"
}

fase_preparar() {
  rm -f "$MOTIVO_ARCHIVO"
  {
    echo "## Promocion canary"
    echo "| Etapa | Peso | Bake | Decision | Peticiones canary | Errores canary | p95 canary | p95 stable |"
    echo "|---|---|---|---|---|---|---|---|"
  } >> "$RESUMEN"

  echo "== Preparacion: despertando los servicios (plan gratis) =="
  local par nombre url
  for par in "stable:${STABLE_URL:-}" "canary:${CANARY_URL:-}"; do
    nombre="${par%%:*}"; url="${par#*:}"
    [ -z "$url" ] && { echo "Sin URL de $nombre: se omite el calentamiento directo"; continue; }
    if ! calentar "$nombre" "$url"; then
      echo "::error::El servicio $nombre no respondio HTTP 200 en ${WARMUP_MAX_SEGUNDOS}s: no se inicia la promocion"
      echo "### 🛑 No se inicio la promocion: $nombre no responde" >> "$RESUMEN"
      exit 1
    fi
  done

  # Alloy envia las metricas a Grafana. No es parte de la decision del gate (el gate lee las
  # metricas del router), por eso no bloquea: solo se despierta y se avisa si no responde.
  if [ -n "${ALLOY_URL:-}" ]; then
    calentar "alloy" "${ALLOY_URL%/}" "/-/ready" || echo "::warning::Alloy no respondio en ${WARMUP_MAX_SEGUNDOS}s: el tablero de Grafana puede mostrar huecos"
  else
    echo "Sin ALLOY_URL: se omite el despertar de Alloy"
  fi
}

fase_humo() {
  echo "== Etapa 0: 0% publico, prueba de humo con x-canary =="
  peso 0 || fallar "no se pudo fijar el peso en 0"

  local interno publico
  interno="$(sondear_ok -H 'x-canary: true' "$ROUTER_URL/health")" || fallar "x-canary: true no obtuvo HTTP 200 del canary (resultado '$interno')"
  publico="$(sondear_ok "$ROUTER_URL/health")" || fallar "el trafico publico no obtuvo HTTP 200 (resultado '$publico')"
  echo "con x-canary -> ${interno%|*} (HTTP ${interno#*|}) | sin cabecera -> ${publico%|*} (HTTP ${publico#*|})"
  [ "${interno%|*}" = "canary" ] || fallar "x-canary: true no llego al canary (llego a '${interno%|*}')"
  [ "${publico%|*}" = "stable" ] || fallar "el trafico publico con peso 0 no fue a stable (fue a '${publico%|*}')"
  echo "| 0 | 0% | - | humo OK (200) | - | - | - | - |" >> "$RESUMEN"
}

fase_caos() {
  if [ "$INYECTAR_FALLA" = "true" ]; then
    echo "== Inyectando falla en el canary (50% de errores 500 + 400ms) =="
    caos '{"tasa_error":0.5,"latencia_ms":400}' || fallar "no se pudo activar el caos"
  else
    echo "Sin falla inyectada (INYECTAR_FALLA=false)"
  fi
}

# Una etapa de promocion: la numeracion y los pesos salen de slo.json.
fase_etapa() {
  local etapa="$1" p segundos extensiones resultado codigo decision motivo fila
  p="$(jq -r ".etapas[\"$etapa\"].peso // empty" "$SLO")"
  [ -z "$p" ] && fallar "la etapa $etapa no existe en slo.json"
  if [ "$DEMO" = "true" ]; then
    segundos="$(jq -r ".demo.bake_segundos[\"$etapa\"]" "$SLO")"
  else
    segundos="$(( $(jq -r ".etapas[\"$etapa\"].bake_minutos" "$SLO") * 60 ))"
  fi
  segundos="${BAKE_SEGUNDOS:-$segundos}"

  echo "== Etapa $etapa: $p% al canary, bake ${segundos}s =="
  peso "$p" || fallar "no se pudo fijar el peso en $p"
  sleep 3
  node "$AQUI/gate.mjs" snapshot --router "$ROUTER_URL" --salida "$ESTADO" || fallar "no se pudo leer /router/metrics"

  extensiones=0
  while true; do
    node "$AQUI/carga.mjs" --router "$ROUTER_URL" --duracion "$segundos" > /dev/null || true
    resultado="$(node "$AQUI/gate.mjs" evaluar --router "$ROUTER_URL" --antes "$ESTADO" --etapa "$etapa" --slo "$SLO")"
    codigo=$?
    echo "$resultado"
    decision="$(echo "$resultado" | jq -r .decision)"
    motivo="$(echo "$resultado" | jq -r .motivo)"
    fila="| $etapa | $p% | ${segundos}s | **$decision** | $(echo "$resultado" | jq -r '.canary.peticiones') | $(echo "$resultado" | jq -r '.canary.errores_5xx') | $(echo "$resultado" | jq -r '.canary.p95_ms // 0 | floor')ms | $(echo "$resultado" | jq -r '.stable.p95_ms // 0 | floor')ms |"
    echo "$fila" >> "$RESUMEN"

    case "$codigo" in
      0) echo "Etapa $etapa promovida: $motivo"; return 0 ;;
      10)
        extensiones=$((extensiones + 1))
        [ "$extensiones" -gt "$MAX_EXTENSIONES" ] && fallar "etapa $etapa sin muestra suficiente tras $MAX_EXTENSIONES extensiones"
        echo "Pausa: $motivo. Extendiendo la observacion ($extensiones/$MAX_EXTENSIONES)"
        ;;
      20) fallar "ABORTO en la etapa $etapa: $motivo" ;;
      *) fallar "el gate fallo de forma inesperada (codigo $codigo)" ;;
    esac
  done
}

fase_cierre() {
  echo "Canary promovido al 100%"
  echo "### ✅ Canary promovido al 100%" >> "$RESUMEN"
  caos apagar
  limpiar
}

# Paso de rollback del workflow (if: failure()): lee el motivo que dejo la fase que fallo.
fase_rollback() {
  local motivo
  motivo="$(cat "$MOTIVO_ARCHIVO" 2>/dev/null || echo "una fase anterior fallo")"
  echo "ROLLBACK por: $motivo"
  hacer_rollback "$motivo"
}

fase_limpieza() {
  caos apagar
  limpiar
}

case "${1:-todo}" in
  preparar) fase_preparar ;;
  humo)     fase_humo ;;
  caos)     fase_caos ;;
  etapa)    fase_etapa "${2:?Falta el numero de etapa (1..5)}" ;;
  cierre)   fase_cierre ;;
  rollback) fase_rollback ;;
  limpieza) fase_limpieza ;;
  todo)
    fase_preparar
    fase_humo
    fase_caos
    trap 'caos apagar' EXIT
    for etapa in $(jq -r '.etapas | keys_unsorted[]' "$SLO"); do
      fase_etapa "$etapa"
    done
    fase_cierre
    ;;
  *)
    echo "Uso: promover.sh [todo|preparar|humo|caos|etapa N|cierre|rollback|limpieza]" >&2
    exit 1
    ;;
esac
