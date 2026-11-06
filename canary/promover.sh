#!/usr/bin/env bash
# Promocion progresiva del canary por etapas, con quality gate y rollback.
#
#   Etapa 0: 0% publico. Prueba de humo con x-canary: true.
#   Etapa 1..3: sube el peso, genera carga durante el bake time, evalua el gate.
#   promover -> siguiente etapa | pausar -> extiende la observacion | abortar -> peso 0 y falla.
#
# Variables:
#   ROUTER_URL, ADMIN_KEY            (obligatorias)
#   STABLE_URL, CANARY_URL           (recomendadas) se despiertan antes de empezar: en el plan
#                                    gratis de Render los servicios hibernan tras ~15 min sin trafico
#   CANARY_TEAM_API_KEY              (solo para INYECTAR_FALLA=true)
#   WARMUP_MAX_SEGUNDOS              espera maxima por servicio al despertarlo (120 por defecto)
#   DEMO=true                        usa los tiempos cortos de slo.json
#   BAKE_SEGUNDOS                    fuerza la duracion de cada bake (pruebas locales)
#   SLO_ARCHIVO                      otro archivo de umbrales (pruebas locales)
#   INYECTAR_FALLA=true              activa /admin/caos en el canary para simular una regresion
set -uo pipefail

: "${ROUTER_URL:?Falta ROUTER_URL}" "${ADMIN_KEY:?Falta ADMIN_KEY}"
ROUTER_URL="${ROUTER_URL%/}"
DEMO="${DEMO:-true}"
INYECTAR_FALLA="${INYECTAR_FALLA:-false}"
MAX_EXTENSIONES="${MAX_EXTENSIONES:-3}"
WARMUP_MAX_SEGUNDOS="${WARMUP_MAX_SEGUNDOS:-120}"
AQUI="$(cd "$(dirname "$0")" && pwd)"
SLO="${SLO_ARCHIVO:-$AQUI/slo.json}"
ESTADO="${RUNNER_TEMP:-/tmp}/estado-router.json"
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

# Despierta un servicio con peticiones directas a /health hasta que responda 200.
calentar() {
  local nombre="$1" url="${2%/}" codigo fin=$((SECONDS + WARMUP_MAX_SEGUNDOS))
  while [ "$SECONDS" -lt "$fin" ]; do
    codigo="$(curl -s -o /dev/null -m 30 -w '%{http_code}' "$url/health" 2>/dev/null || true)"
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
  track="$(tr -d '' < "$cabeceras" | grep -i '^x-routed-to:' | awk '{print $2}')"
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

terminar_con_rollback() {
  echo "::error::ABORTO del canary: $1"
  peso 0
  echo "Rollback: 0% hacia canary, 100% hacia stable"
  {
    echo "### 🛑 Rollback automatico"
    echo "Motivo: $1"
    echo "El router quedo en **0%** hacia canary y **100%** hacia stable."
  } >> "$RESUMEN"
  caos apagar
  limpiar
  exit 1
}

{
  echo "## Promocion canary"
  echo "| Etapa | Peso | Bake | Decision | Peticiones canary | Errores canary | p95 canary | p95 stable |"
  echo "|---|---|---|---|---|---|---|---|"
} >> "$RESUMEN"

# ---- Antes de tocar el router: despertar y comprobar los servicios ----
echo "== Preparacion: despertando los servicios (plan gratis) =="
for par in "stable:${STABLE_URL:-}" "canary:${CANARY_URL:-}"; do
  nombre="${par%%:*}"; url="${par#*:}"
  [ -z "$url" ] && { echo "Sin URL de $nombre: se omite el calentamiento directo"; continue; }
  if ! calentar "$nombre" "$url"; then
    echo "::error::El servicio $nombre no respondio HTTP 200 en ${WARMUP_MAX_SEGUNDOS}s: no se inicia la promocion"
    echo "### 🛑 No se inicio la promocion: $nombre no responde" >> "$RESUMEN"
    exit 1
  fi
done

# ---- Etapa 0: 0% publico, solo acceso interno por cabecera ----
echo "== Etapa 0: 0% publico, prueba de humo con x-canary =="
peso 0 || terminar_con_rollback "no se pudo fijar el peso en 0"

interno="$(sondear_ok -H 'x-canary: true' "$ROUTER_URL/health")" || terminar_con_rollback "x-canary: true no obtuvo HTTP 200 del canary (resultado '$interno')"
publico="$(sondear_ok "$ROUTER_URL/health")" || terminar_con_rollback "el trafico publico no obtuvo HTTP 200 (resultado '$publico')"
echo "con x-canary -> ${interno%|*} (HTTP ${interno#*|}) | sin cabecera -> ${publico%|*} (HTTP ${publico#*|})"
[ "${interno%|*}" = "canary" ] || terminar_con_rollback "x-canary: true no llego al canary (llego a '${interno%|*}')"
[ "${publico%|*}" = "stable" ] || terminar_con_rollback "el trafico publico con peso 0 no fue a stable (fue a '${publico%|*}')"
echo "| 0 | 0% | - | humo OK (200) | - | - | - | - |" >> "$RESUMEN"

if [ "$INYECTAR_FALLA" = "true" ]; then
  echo "== Inyectando falla en el canary (50% de errores 500 + 400ms) =="
  caos '{"tasa_error":0.5,"latencia_ms":400}' || terminar_con_rollback "no se pudo activar el caos"
fi
trap 'caos apagar' EXIT

# ---- Etapas 1..3 ----
for etapa in 1 2 3; do
  p="$(jq -r ".etapas[\"$etapa\"].peso" "$SLO")"
  if [ "$DEMO" = "true" ]; then
    bake="$(jq -r ".demo.bake_minutos[\"$etapa\"]" "$SLO")"
  else
    bake="$(jq -r ".etapas[\"$etapa\"].bake_minutos" "$SLO")"
  fi
  segundos="${BAKE_SEGUNDOS:-$((bake * 60))}"

  echo "== Etapa $etapa: $p% al canary, bake ${segundos}s =="
  peso "$p" || terminar_con_rollback "no se pudo fijar el peso en $p"
  sleep 3
  node "$AQUI/gate.mjs" snapshot --router "$ROUTER_URL" --salida "$ESTADO" || terminar_con_rollback "no se pudo leer /router/metrics"

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
      0) echo "Etapa $etapa promovida: $motivo"; break ;;
      10)
        extensiones=$((extensiones + 1))
        [ "$extensiones" -gt "$MAX_EXTENSIONES" ] && terminar_con_rollback "etapa $etapa sin muestra suficiente tras $MAX_EXTENSIONES extensiones"
        echo "Pausa: $motivo. Extendiendo la observacion ($extensiones/$MAX_EXTENSIONES)"
        ;;
      20) terminar_con_rollback "etapa $etapa: $motivo" ;;
      *) terminar_con_rollback "el gate fallo de forma inesperada (codigo $codigo)" ;;
    esac
  done
done

echo "Canary promovido al 100%"
echo "### ✅ Canary promovido al 100%" >> "$RESUMEN"
limpiar
