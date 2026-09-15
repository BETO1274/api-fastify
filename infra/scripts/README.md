# Scripts de infraestructura (manuales, no forman parte del pipeline)

Estos scripts se corren a mano cuando hace falta — no están conectados a los pipelines de GitHub Actions.

* **`migrar-a-azure.js`** — aplica el esquema (las migraciones de `supabase/migrations/`) y copia todos los datos desde el origen (Supabase Producción) hacia el destino (Azure PostgreSQL), preservando ids y reiniciando las secuencias. Se usa después de crear un servidor de PostgreSQL vacío con `infra/main.bicep`.
  ```
  ORIGEN_URL=... DESTINO_URL=... node migrar-a-azure.js
  ```

* **`seed-produccion.js`** — vacía (⚠️ `TRUNCATE`) y siembra un volumen realista de datos (70 articulo, 88 stock, 58 receta, 60 fabricacion) en la base de datos que le indiques. Solo hace falta si algún día se necesita regenerar los datos de demo desde cero — **no** se usa en el flujo normal de recrear Azure (ese flujo usa `migrar-a-azure.js`, que trae los datos reales ya existentes en Supabase).
  ```
  DATABASE_URL=... node seed-produccion.js
  ```

## Variables reales

Están en `.env.local` (en esta misma carpeta, gitignorado) y también documentadas en `credentials.local.md`. Nunca hardcodear valores reales dentro de estos archivos `.js` — ambos leen `process.env`.

Con Node 22+, se pueden cargar automáticamente con `--env-file`:
```powershell
node --env-file=.env.local migrar-a-azure.js
```
