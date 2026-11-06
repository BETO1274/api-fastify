#!/usr/bin/env bash
# Demostracion de los puntos (a) y (b) de la rubrica, para que el pipeline los MUESTRE:
#   (a) acceso al canary con 0 % publico, con y sin la cabecera x-canary
#   (b) distribucion real del trafico por porcentajes entre stable y canary
#
# Uso: demo-acceso.sh [despertar | acceso | reparto [PESO] [PETICIONES] | volver]
#
# Variables: ROUTER_URL, ADMIN_KEY (obligatorias); STABLE_URL, CANARY_URL (para despertar).
# Escribe en el Summary del job (GITHUB_STEP_SUMMARY) las tablas de resultados.
set -uo pipefail

: "${ROUTER_URL:?Falta ROUTER_URL}" "${ADMIN_KEY:?Falta ADMIN_KEY}"
ROUTER_URL="${ROUTER_URL%/}"
WARMUP_MAX_SEGUNDOS="${WARMUP_MAX_SEGUNDOS:-120}"
RESUMEN="${GITHUB_STEP_SUMMARY:-/dev/null}"

peso() {
  curl -fsS -X POST "$ROUTER_URL/router/weight" \
    -H "x-admin-key: $ADMIN_KEY" -H 'content-type: application/json' \
    -d "{\"canary_weight\":$1}" > /dev/null
}

# Despierta un servicio con peticiones a la ruta de salud hasta que responda 200.
calentar() {
  local nombre="$1" url="$2" codigo fin=$((SECONDS + WARMUP_MAX_SEGUNDOS))
  while [ "$SECONDS" -lt "$fin" ]; do
    codigo="$(curl -s -o /dev/null -m 30 -w '%{http_code}' "$url" 2>/dev/null || true)"
    if [ "$codigo" = "200" ]; then
      echo "$nombre listo (HTTP 200)"
      return 0
    fi
    echo "$nombre aun no responde (HTTP ${codigo:-000}), reintentando..."
    sleep 5
  done
  return 1
}

# Hace una peticion y deja los datos en variables: CODIGO, TRACK, VERSION, RUTA_TRACK, ID, CATEGORIA.
consultar() {
  local cab cuerpo
  cab="$(mktemp)"; cuerpo="$(mktemp)"
  CODIGO="$(curl -s -m 30 -o "$cuerpo" -D "$cab" -w '%{http_code}' "$@" 2>/dev/null || true)"
  cabecera() { tr -d '\r' < "$cab" | grep -i "^$1:" | head -1 | sed -E 's/^[^:]+:[[:space:]]*//'; }
  RUTA_TRACK="$(cabecera x-routed-to)"
  TRACK="$(cabecera x-track)"
  VERSION="$(cabecera x-app-version)"
  ID="$(cabecera x-request-id)"
  if grep -q '"categoria"' "$cuerpo"; then CATEGORIA="si"; else CATEGORIA="no"; fi
  rm -f "$cab" "$cuerpo"
  : "${CODIGO:=000}"
}

fase_despertar() {
  echo "== Despertando los servicios (plan gratis) =="
  local par
  for par in "router:$ROUTER_URL/router/health" "stable:${STABLE_URL:-}/health" "canary:${CANARY_URL:-}/health"; do
    local nombre="${par%%:*}" url="${par#*:}"
    case "$url" in "/health") echo "Sin URL de $nombre: se omite"; continue ;; esac
    calentar "$nombre" "$url" || { echo "::error::$nombre no respondio HTTP 200 en ${WARMUP_MAX_SEGUNDOS}s"; exit 1; }
  done
}

fase_acceso() {
  echo "== (a) Acceso al canary con 0 % publico =="
  peso 0 || { echo "::error::no se pudo fijar el peso en 0"; exit 1; }
  echo "Peso del canary fijado en 0 %: nadie ve el canary salvo con la cabecera x-canary."
  echo

  local fallos=0
  {
    echo "## (a) Acceso al canary con 0 % publico"
    echo "| Peticion | HTTP | Destino | X-Track | Version | categoria | X-Request-Id |"
    echo "|---|---|---|---|---|---|---|"
  } >> "$RESUMEN"

  echo ">>> GET /articulos/1   (sin cabecera: trafico publico)"
  consultar "$ROUTER_URL/articulos/1"
  echo "    HTTP $CODIGO | X-Routed-To: $RUTA_TRACK | X-Track: $TRACK | X-App-Version: $VERSION | categoria: $CATEGORIA | X-Request-Id: $ID"
  echo "| sin cabecera | $CODIGO | **$RUTA_TRACK** | $TRACK | $VERSION | $CATEGORIA | \`$ID\` |" >> "$RESUMEN"
  [ "$CODIGO" = "200" ] && [ "$RUTA_TRACK" = "stable" ] && [ "$CATEGORIA" = "no" ] || { echo "::error::El trafico publico debia ir a stable (200) y sin categoria"; fallos=1; }

  echo
  echo ">>> GET /articulos/1   (con x-canary: true: acceso interno)"
  consultar -H 'x-canary: true' "$ROUTER_URL/articulos/1"
  echo "    HTTP $CODIGO | X-Routed-To: $RUTA_TRACK | X-Track: $TRACK | X-App-Version: $VERSION | categoria: $CATEGORIA | X-Request-Id: $ID"
  echo "| \`x-canary: true\` | $CODIGO | **$RUTA_TRACK** | $TRACK | $VERSION | $CATEGORIA | \`$ID\` |" >> "$RESUMEN"
  [ "$CODIGO" = "200" ] && [ "$RUTA_TRACK" = "canary" ] && [ "$CATEGORIA" = "si" ] || { echo "::error::Con x-canary debia llegar al canary (200) y traer categoria"; fallos=1; }

  echo >> "$RESUMEN"
  echo "Con 0 % nadie ve el canary, pero con la cabecera el equipo lo prueba en produccion real." >> "$RESUMEN"
  echo
  [ "$fallos" -eq 0 ] && echo "OK: el publico va a stable y x-canary llega al canary."
  return "$fallos"
}

fase_reparto() {
  local p="${1:-30}" n="${2:-100}" i conteo_s=0 conteo_c=0 otros=0
  echo "== (b) Reparto real: $p % al canary, $n peticiones sin cookie =="
  peso "$p" || { echo "::error::no se pudo fijar el peso en $p"; exit 1; }
  sleep 2

  for i in $(seq 1 "$n"); do
    consultar "$ROUTER_URL/articulos/1"
    case "$RUTA_TRACK" in
      stable) conteo_s=$((conteo_s + 1)) ;;
      canary) conteo_c=$((conteo_c + 1)) ;;
      *) otros=$((otros + 1)) ;;
    esac
  done

  local pct_s pct_c
  pct_s="$(awk -v a="$conteo_s" -v b="$n" 'BEGIN{printf "%.0f", a*100/b}')"
  pct_c="$(awk -v a="$conteo_c" -v b="$n" 'BEGIN{printf "%.0f", a*100/b}')"
  echo "stable: $conteo_s de $n ($pct_s %) | canary: $conteo_c de $n ($pct_c %) | sin respuesta valida: $otros"
  echo "esperado: stable ~$((100 - p)) % | canary ~$p %"

  {
    echo "## (b) Distribucion real del trafico: $p % al canary"
    echo "| Destino | Version | Peticiones | % observado | % esperado |"
    echo "|---|---|---|---|---|"
    echo "| stable | v3 | $conteo_s | $pct_s % | $((100 - p)) % |"
    echo "| canary | v4 | $conteo_c | $pct_c % | $p % |"
    echo
    echo "El reparto es probabilistico: con pocas peticiones el porcentaje observado se mueve alrededor del esperado. Por eso el quality gate exige una muestra minima antes de decidir."
  } >> "$RESUMEN"

  if [ "$otros" -gt 0 ]; then
    echo "::error::$otros peticiones no recibieron una respuesta valida del router"
    return 1
  fi
  if [ "$p" -ge 5 ] && [ "$p" -le 95 ] && { [ "$conteo_s" -eq 0 ] || [ "$conteo_c" -eq 0 ]; }; then
    echo "::error::Con $p % debian llegar peticiones a las dos versiones"
    return 1
  fi
  echo "OK: el trafico se reparte entre las dos versiones."
}

fase_volver() {
  peso 0 && echo "Peso del canary devuelto a 0 %: todo el trafico va a stable."
  echo >> "$RESUMEN"
  echo "### Peso devuelto a 0 %: todo el trafico vuelve a stable." >> "$RESUMEN"
}

case "${1:-todo}" in
  despertar) fase_despertar ;;
  acceso)    fase_acceso ;;
  reparto)   fase_reparto "${2:-30}" "${3:-100}" ;;
  volver)    fase_volver ;;
  todo)
    fase_despertar
    trap 'fase_volver' EXIT
    fase_acceso
    fase_reparto 30 100
    ;;
  *)
    echo "Uso: demo-acceso.sh [despertar | acceso | reparto [PESO] [PETICIONES] | volver]" >&2
    exit 1
    ;;
esac
