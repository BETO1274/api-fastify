# Scripts de infraestructura (manuales, no forman parte del pipeline)

Estos scripts se corren a mano cuando hace falta — no están conectados a los pipelines de GitHub Actions.

* **`migrar-a-azure.js`** — aplica el esquema (las migraciones de `supabase/migrations/`) en el destino (Azure PostgreSQL). Tiene dos modos:
  * **Solo esquema** (sin `ORIGEN_URL`): aplica las migraciones y termina. Es el que usa el workflow de despliegue desde la entrega de Ingeniería del Caos, porque el Supabase de Producción ya no existe.
    ```
    DESTINO_URL=... node migrar-a-azure.js
    ```
  * **Completo** (con `ORIGEN_URL`): además copia todos los datos desde el origen, preservando ids y reiniciando las secuencias.
    ```
    ORIGEN_URL=... DESTINO_URL=... node migrar-a-azure.js
    ```

* **`seed-produccion.js`** — vacía (⚠️ `TRUNCATE ... RESTART IDENTITY`) y siembra un volumen realista de datos sintéticos (70 articulo, 88 stock, 58 receta, 60 fabricacion) en la base de datos que le indiques. Como reinicia las identidades, el artículo con **id 1** siempre existe tras sembrar: es el ID sintético que se comparte con los otros equipos. El workflow de despliegue lo corre después de aplicar el esquema.
  ```
  DATABASE_URL=... node seed-produccion.js
  ```

## Variables reales

Están en `.env.local` (en esta misma carpeta, gitignorado) y también documentadas en `credentials.local.md`. Nunca hardcodear valores reales dentro de estos archivos `.js` — ambos leen `process.env`.

Con Node 22+, se pueden cargar automáticamente con `--env-file`:
```powershell
node --env-file=.env.local migrar-a-azure.js
```
