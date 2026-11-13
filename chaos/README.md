# Ingeniería del Caos — experimentos como código

Experimentos de resiliencia del flujo `GET /api/v2/articulos/:id` de api-fastify (el coordinador), que en una sola petición conecta las tres nubes: api-fastify en Azure/AKS, deportBack e Inventario-U. Las dos llamadas salientes van en paralelo y propagan el mismo `X-Trace-Id`. Todo se ejecuta **solo sobre la infraestructura del propio grupo**, con **datos sintéticos** y en una **ventana acordada** por los tres integrantes.

> **Estado:** preparado, **sin ejecutar**. No hay mediciones ni resultados todavía. Los valores del estado estable y los umbrales están `PENDIENTE` a propósito: salen de medir el sistema desplegado, no de suposiciones.

## Qué hay aquí

| Archivo | Para qué |
|---|---|
| `instalar-chaos-mesh.sh` | Instala Chaos Mesh en el AKS, sin dashboard y solo habilitado en nuestros namespaces. |
| `experiments/latencia-saliente.experimento.yaml` | **El experimento como código:** estado estable, hipótesis, método de inyección, radio de impacto, duración, condiciones de aborto y reversión. |
| `experiments/latencia-saliente.chaosmesh.yaml` | Manifiesto de Chaos Mesh (`NetworkChaos`, plantilla con variables): latencia en la salida de api-fastify hacia deportBack. |
| `latencia-saliente.sh` | Interruptor propio de latencia saliente (código de api-fastify, `src/common/caos-saliente.js`): activar, consultar y apagar en **todas** las réplicas. |
| `revertir.sh` | Reversión inmediata de todo fallo inyectado, con verificación. |

El perfil de carga está en [`../load/`](../load/README.md) y es **el mismo** en la Ronda 0 y la Ronda 1.

## Los dos mecanismos de inyección

La rúbrica pide una herramienta declarativa **y** un interruptor propio en el código:

* **Chaos Mesh (`NetworkChaos`)**: declarativo, inyecta latencia de red a nivel de pod hacia un destino externo. Su campo `duration` lo retira solo.
* **Interruptor propio** (`src/common/caos-saliente.js`): latencia en el código, activable en caliente, atribuible a una dependencia concreta. Cubre el caso en que la herramienta no pueda apuntar al destino (por ejemplo, si deportBack cambia de IP).

## Seguridad y radio de impacto

* Chaos Mesh **sin dashboard** (ninguna interfaz administrativa expuesta) y con filtro de namespaces: solo actúa donde hay `chaos-mesh.org/inject=enabled` (`orchestrator` y `api-fastify`).
* Los controles `/admin/caos-saliente` del interruptor propio exigen `x-api-key` (se revisa antes de validar el cuerpo) y **siempre llevan duración** (máximo 30 min): el proceso apaga el fallo solo, aunque el controlador muera. Son distintos de `/admin/caos`, que es el caos entrante del track canary.
* **Patrones de resiliencia** (en `src/common/http-externo.js`): timeout por dependencia, circuit breaker y degradación. Con la configuración por defecto el comportamiento es el de siempre (Ronda 0); `CB_ACTIVO=true` y un timeout ajustado a lo medido son la Ronda 1, con la misma imagen.
* El experimento afecta únicamente el tráfico de **salida** de los pods de api-fastify hacia deportBack; Inventario-U y el resto del clúster no se tocan.
* **Nunca** se apunta a recursos de terceros, de la Universidad ni de otros grupos.

## Antes de la primera ejecución

1. Chaos Mesh instalado (`bash chaos/instalar-chaos-mesh.sh`) y sistema desplegado.
2. Los tres integrantes confirmaron la **ventana** y la dirección de deportBack (`DEPORTBACK_HOST`).
3. Estado estable **medido** con el perfil de carga y escrito en el descriptor. Métrica objetivo y umbral acordados.
4. **`bash chaos/revertir.sh` probado en el clúster** (debe terminar con "Reversión completa"). Hasta entonces `probada_antes_de_la_primera_ejecucion` queda en `false`.

## Ejecutar (manual, por ahora)

```bash
# 1. Carga (en otra terminal): perfil fijo, ver load/README.md
# 2. Cuando la carga entre al escalón de 10 req/s (t = 90 s), inyectar:
DEPORTBACK_HOST=<host> LATENCIA_MS=<ms> DURACION=90s \
  envsubst < chaos/experiments/latencia-saliente.chaosmesh.yaml | kubectl apply -f -

# Alternativa con el interruptor propio:
bash chaos/latencia-saliente.sh activar deportback <latencia_ms> 90

# 3. Revertir de inmediato si hace falta (también ocurre solo al vencer la duración):
bash chaos/revertir.sh
```

Las **condiciones de aborto** del descriptor las evaluará el ejecutor automático del experimento (chaos gate), que todavía no está construido; mientras tanto, quien ejecuta debe vigilar el tablero y revertir a mano.

## Pendiente

* Ejecutor automático con condiciones de aborto y evidencia (chaos gate en CI).
* Medición del estado estable, Ronda 0, diagnóstico y Ronda 1.
* Cálculo de MTTD y MTTR a partir de la serie de tiempo y de las marcas del experimento.
