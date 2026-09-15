// Migra esquema + datos de Supabase Producción hacia el servidor Azure.
// Uso: ORIGEN_URL y DESTINO_URL como variables de entorno (nunca hardcodeadas
// aquí) — ver credentials.local.md para los valores reales.
//
//   ORIGEN_URL="postgresql://...supabase..." DESTINO_URL="postgresql://...azure...?sslmode=require" node infra/scripts/migrar-a-azure.js

import { Client } from 'pg'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const ORIGEN = process.env.ORIGEN_URL
const DESTINO = process.env.DESTINO_URL

if (!ORIGEN || !DESTINO) {
  console.error('Faltan ORIGEN_URL y/o DESTINO_URL como variables de entorno. Ver el comentario de uso al inicio de este archivo.')
  process.exit(1)
}

const CARPETA_MIGRACIONES = path.join(__dirname, '..', '..', 'supabase', 'migrations')

async function aplicarEsquema(destino) {
  console.log('=== Aplicando esquema (migraciones) a Azure ===')
  const archivos = fs.readdirSync(CARPETA_MIGRACIONES).filter((f) => f.endsWith('.sql')).sort()
  for (const archivo of archivos) {
    console.log(`  ejecutando ${archivo}...`)
    const sql = fs.readFileSync(path.join(CARPETA_MIGRACIONES, archivo), 'utf8')
    await destino.query(sql)
  }
  console.log('Esquema aplicado.\n')
}

async function copiarTabla(origen, destino, tabla, columnas) {
  const { rows } = await origen.query(`select ${columnas.join(', ')} from ${tabla} order by id`)
  console.log(`  ${tabla}: ${rows.length} filas a copiar`)

  for (const fila of rows) {
    const valores = columnas.map((c) => fila[c])
    const marcadores = columnas.map((_, i) => `$${i + 1}`).join(', ')
    await destino.query(
      `insert into ${tabla} (${columnas.join(', ')}) values (${marcadores})`,
      valores
    )
  }

  // Reiniciar la secuencia del id para que las próximas inserciones sigan
  // desde el máximo id copiado, no desde 1.
  await destino.query(
    `select setval(pg_get_serial_sequence('${tabla}', 'id'), coalesce((select max(id) from ${tabla}), 1))`
  )

  return rows.length
}

async function main() {
  const origen = new Client({ connectionString: ORIGEN })
  const destino = new Client({ connectionString: DESTINO, ssl: { rejectUnauthorized: false } })

  await origen.connect()
  await destino.connect()

  await aplicarEsquema(destino)

  console.log('=== Copiando datos (respetando el orden de dependencias) ===')
  await copiarTabla(origen, destino, 'articulo', ['id', 'nombre', 'tipo', 'unidad_medida', 'creado_en', 'actualizado_en'])
  await copiarTabla(origen, destino, 'stock', ['id', 'articulo_id', 'cantidad', 'ubicacion', 'creado_en', 'actualizado_en'])
  await copiarTabla(origen, destino, 'receta', ['id', 'producto_final_id', 'creado_en', 'actualizado_en'])
  await copiarTabla(origen, destino, 'receta_ingrediente', ['id', 'receta_id', 'articulo_id', 'cantidad_necesaria'])
  await copiarTabla(origen, destino, 'fabricacion', ['id', 'receta_id', 'cantidad_producir', 'fecha'])

  console.log('\n=== Verificación de conteos (origen vs destino) ===')
  for (const tabla of ['articulo', 'stock', 'receta', 'receta_ingrediente', 'fabricacion']) {
    const o = await origen.query(`select count(*) from ${tabla}`)
    const d = await destino.query(`select count(*) from ${tabla}`)
    const igual = o.rows[0].count === d.rows[0].count ? 'OK' : 'DIFERENTE ⚠️'
    console.log(`  ${tabla}: origen=${o.rows[0].count} destino=${d.rows[0].count} [${igual}]`)
  }

  await origen.end()
  await destino.end()
  console.log('\nMigración completada.')
}

main().catch((error) => {
  console.error('Error en la migración:', error)
  process.exit(1)
})
