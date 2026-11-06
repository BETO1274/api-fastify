# Guía de sustentación: Canary Deployments

La sustentación pesa el **60 %**: preguntas verbales y demostración en vivo sobre la nube. Esta guía tiene el guion de la demo y el repaso de conceptos.

## Antes de entrar (10 minutos antes)

- [ ] Los 3 servicios de Render en *Live* y calientes: `curl -i $ROUTER/health` dos o tres veces.
- [ ] Peso del router en 0: `curl -s -H "x-admin-key: ..." $ROUTER/router/weight`.
- [ ] Tablero de Grafana abierto, rango de 30 min, refresco de 10 s.
- [ ] Pestaña de GitHub Actions con *Canary - Promover por etapas* lista.
- [ ] Terminal con `ROUTER_URL` exportada.

## Guion de la demo en vivo (a, b, c, d de la rúbrica)

### (a) Acceso al canary con el 0 % público

```bash
curl -i $ROUTER_URL/articulos/1                        # X-Routed-To: stable, X-App-Version: 3.0.1
curl -i -H "x-canary: true" $ROUTER_URL/articulos/1    # X-Routed-To: canary, X-App-Version: 4.0.0
```

Qué decir: el peso público es 0 %, nadie ve el canary, pero el equipo puede probarlo en producción real con la cabecera. Esa es la etapa 0.

### (b) Distribución real de tráfico entre stable (v3) y canary (v4)

```bash
curl -s -X POST $ROUTER_URL/router/weight -H "x-admin-key: $ADMIN_KEY" -H "content-type: application/json" -d '{"canary_weight":30}'
for i in $(seq 1 50); do curl -s -o /dev/null -D - $ROUTER_URL/health | grep -i x-routed-to; done | sort | uniq -c
```

Resultado esperado: aproximadamente 35 `stable` y 15 `canary`. Qué decir: el reparto es probabilístico, y por eso hace falta una muestra grande antes de decidir (ver tamaño de muestra). Vuelve a 0 al terminar.

### (c) Comparación de métricas en el tablero

Mostrar, lado a lado, tráfico, errores 5xx, p50/p95/p99, CPU/memoria y artículos creados por minuto de cada track. Señalar el peso, la versión de cada servicio y la muestra acumulada.

### (d) Dos escenarios completos

**Escenario 1: promoción exitosa hasta el 100 %**

Actions → *Canary - Promover por etapas* → `demo: true`, `inyectar_falla: false`. Narrar mientras corre (cada etapa dura 90 s; en total unos 8 minutos más el despliegue final de stable):

1. Etapa 0: humo con `x-canary`.
2. Etapas 1 a 5 (10 %, 25 %, 50 %, 75 % y 100 %): sube el peso, hay carga, se espera el bake y el gate evalúa.
3. Al final, stable pasa a ejecutar la imagen v4 y el peso vuelve a 0.

En el tablero se ve cómo crece el tráfico del canary con cada etapa y que errores y latencia se mantienen parecidos a stable.

**Escenario 2: aborto y rollback al inyectar una falla**

Actions → *Canary - Promover por etapas* → `inyectar_falla: true`. El canary empieza a devolver 500 en la mitad de las peticiones y con 400 ms de latencia. El gate detecta que se superan los umbrales (errores > 2 %, p95 sobre el límite), **aborta, deja el router en 0 % hacia canary y 100 % hacia stable**, y el job falla a propósito. En el tablero se ve el pico de errores y p95 del canary, y luego el tráfico del canary cae a cero mientras stable sigue sano.

Plan B si algo falla en vivo: *Canary - Rollback inmediato*, o el `curl` de `/router/weight` con `canary_weight: 0`.

## Repaso de conceptos (las preguntas del docente)

| Tema | Respuesta corta |
|---|---|
| **Canary vs rolling update** | Rolling reemplaza instancias gradualmente pero no controla qué porcentaje de usuarios ve la versión nueva ni compara métricas contra una línea base; canary controla el tráfico y decide con datos |
| **Canary vs blue/green** | Blue/green mantiene dos entornos completos y cambia el 100 % de golpe (rollback rápido, costo doble, sin exposición parcial). Canary expone gradualmente y limita el radio de impacto |
| **Canary vs A/B testing** | A/B compara variantes de producto para medir una hipótesis de negocio (conversión). Canary valida la salud técnica de una versión antes de promoverla |
| **Canary vs feature flags** | Los flags activan funciones dentro del mismo binario por usuario o grupo. Canary despliega un artefacto distinto. Se complementan |
| **Canary vs shadow** | Shadow duplica tráfico real a la versión nueva sin devolver su respuesta al usuario (sin riesgo para el cliente, pero sin efectos reales ni validación de escrituras) |
| **Radio de impacto** | La fracción de usuarios que sufre una falla. Con 10 % de tráfico, una regresión afecta como máximo al 10 % y se corta con el rollback |
| **División de tráfico** | Aquí lo hace el router por sorteo ponderado (`canary_weight`), cabecera `x-canary` y cookie sticky. Render no trae splitting nativo |
| **Sesiones fijas (sticky)** | Mantienen a un usuario en el mismo track para que su experiencia no salte entre versiones. Aquí dura 5 min y se **ignora con peso 0** para que el rollback sea inmediato |
| **Señales doradas** | Latencia, tráfico, errores y saturación. Aquí: p50/p95/p99, req/s, 5xx, y CPU/memoria. Más la métrica de negocio `articulos_creados_total` |
| **SLI / SLO** | SLI es lo que se mide (tasa de errores, p95). SLO es el objetivo acordado antes de desplegar (errores ≤ 2 %, p95 ≤ max(1.5 × stable, stable + 100 ms)). Están en `canary/slo.json` |
| **Canary vs baseline** | Se compara contra stable medido a la vez y bajo la misma carga, no contra un número fijo: así se descuentan efectos del momento (red, base de datos lenta) |
| **Tamaño de muestra** | Con pocas peticiones un solo error distorsiona la tasa. Por eso hay mínimos por etapa y el gate **pausa** en vez de promover si la muestra es insuficiente |
| **Bake time** | Tiempo de observación en una etapa antes de decidir. Detecta fallas lentas (fugas de memoria, degradación) que no aparecen al instante |
| **Expand/Contract** | Cambios de esquema compatibles hacia atrás en dos tiempos: *expand* agrega (columna nullable), las dos versiones conviven, y solo cuando la vieja ya no existe se hace *contract*. Garantiza que el rollback no rompa datos |
| **Antipatrones** | Migración destructiva antes de promover; promover sin muestra suficiente; comparar contra un valor fijo; no tener rollback automático; sticky sin expiración; cambiar código y esquema a la vez; canary sin métricas separadas por versión |

## Preguntas probables y cómo contestarlas

- **¿Por qué no usaste splitting nativo de Render?** Render no lo ofrece entre servicios, así que construí un router propio. El costo: es un punto único de falla y añade un salto de red, que se mide por igual para los dos tracks.
- **¿Por qué el artefacto es inmutable?** Se despliega por digest SHA256. Un tag se puede mover, un digest no; así lo que probé en canary es exactamente lo que se promueve a stable.
- **¿Qué pasa con los datos si hago rollback?** Nada: la columna `categoria` es nullable y aditiva, v3 la ignora. No hay que revertir ninguna migración.
- **¿Qué garantiza que el gate no promueva a ciegas?** Tres decisiones, no dos: promover, pausar y abortar. Si no hay muestra suficiente pausa y extiende el bake.
- **¿Cómo verificas que el canary recibió tráfico real?** Por `X-Routed-To` en cada respuesta, por `router_requests_total{track="canary"}` y por el tablero.
- **¿Qué mejorarías?** Router en alta disponibilidad (más de una instancia con el peso en un almacén compartido), análisis estadístico formal en lugar de umbrales fijos, y métricas de negocio en el gate.
