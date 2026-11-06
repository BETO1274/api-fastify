#!/usr/bin/env bash
# Promocion progresiva del canary por etapas, con quality gate y rollback.
#
#   Etapa 0: 0% publico. Prueba de humo con x-canary: true.
#   Etapa 1..3: sube el peso, genera carga durante el bake time, evalua el gate.
#   promover -> siguiente etapa | pausar -> extiende la observacion | abortar -> peso 0 y falla.
#
# Variables:
#   ROUTER_URL, ADMIN_KEY            (obligatorias)
#   CANARY_URL, CANARY_TEAM_API_KEY  (solo para INYECTAR_FALLA=true)
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

# ---- Etapa 0: 0% publico, solo acceso interno por cabecera ----
echo "== Etapa 0: 0% publico, prueba de humo con x-canary =="
peso 0 || terminar_con_rollback "no se pudo fijar el peso en 0"

interno="$(curl -fsS -D - -o /dev/null -H 'x-canary: true' "$ROUTER_URL/health" | tr -d '\r' | grep -i '^x-routed-to:' | awk '{print $2}')"
publico="$(curl -fsS -D - -o /dev/null "$ROUTER_URL/health" | tr -d '\r' | grep -i '^x-routed-to:' | awk '{print $2}')"
echo "con x-canary -> $interno | sin cabecera -> $publico"
[ "$interno" = "canary" ] || terminar_con_rollback "x-canary: true no llego al canary (llego a '$interno')"
[ "$publico" = "stable" ] || terminar_con_rollback "el trafico publico con peso 0 no fue a stable (fue a '$publico')"
echo "| 0 | 0% | - | humo OK | - | - | - | - |" >> "$RESUMEN"

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
