// Vacía y siembra un volumen realista de datos en la base de datos indicada.
// ⚠️ Destructivo: hace TRUNCATE de las 5 tablas antes de sembrar.
// Uso: DATABASE_URL como variable de entorno (nunca hardcodeada aquí).
//
//   DATABASE_URL="postgresql://..." node infra/scripts/seed-produccion.js

const { Client } = require('pg')

const CONNECTION_STRING = process.env.DATABASE_URL

if (!CONNECTION_STRING) {
  console.error('Falta DATABASE_URL como variable de entorno.')
  process.exit(1)
}

const materiasPrimas = [
  ['Harina de trigo', 'kg'], ['Harina integral', 'kg'], ['Harina de maíz', 'kg'],
  ['Azúcar blanca', 'kg'], ['Azúcar morena', 'kg'], ['Levadura seca', 'kg'],
  ['Levadura fresca', 'kg'], ['Sal fina', 'kg'], ['Mantequilla', 'kg'],
  ['Margarina', 'kg'], ['Huevos', 'unidades'], ['Leche entera', 'litros'],
  ['Leche descremada', 'litros'], ['Crema de leche', 'litros'], ['Chocolate en polvo', 'kg'],
  ['Chocolate amargo', 'kg'], ['Vainilla líquida', 'litros'], ['Canela en polvo', 'kg'],
  ['Nuez moscada', 'kg'], ['Polvo de hornear', 'kg'], ['Bicarbonato de sodio', 'kg'],
  ['Aceite vegetal', 'litros'], ['Aceite de oliva', 'litros'], ['Miel', 'litros'],
  ['Avena en hojuelas', 'kg'], ['Almendras', 'kg'], ['Nueces', 'kg'],
  ['Pasas', 'kg'], ['Coco rallado', 'kg'], ['Queso crema', 'kg'],
  ['Fresas', 'kg'], ['Manzanas', 'kg'], ['Plátano', 'kg'],
  ['Limón', 'kg'], ['Naranja', 'kg'], ['Café molido', 'kg'],
  ['Gelatina sin sabor', 'kg'], ['Maicena', 'kg'], ['Colorante vegetal', 'litros'],
  ['Esencia de almendra', 'litros']
]

const productosFinales = [
  'Pan integral', 'Pan de molde', 'Pan baguette', 'Pastel de vainilla', 'Pastel de chocolate',
  'Pastel de zanahoria', 'Galletas de avena', 'Galletas de chocolate', 'Galletas de mantequilla',
  'Muffin de arándanos', 'Muffin de chocolate', 'Croissant', 'Dona glaseada', 'Torta de queso',
  'Brownie', 'Cupcake de vainilla', 'Cupcake de chocolate', 'Pan de banano', 'Rosca de canela',
  'Empanada dulce', 'Alfajor', 'Tarta de manzana', 'Tarta de limón', 'Bizcocho de naranja',
  'Pan francés', 'Bollo de leche', 'Panqueque', 'Waffle', 'Macarrón', 'Trufa de chocolate'
]

const ubicaciones = ['Bodega Principal', 'Bodega A', 'Bodega B', 'Refrigerado', 'Almacén Central']

function aleatorio(min, max) {
  return Math.random() * (max - min) + min
}

function entero(min, max) {
  return Math.floor(aleatorio(min, max + 1))
}

function elegir(lista) {
  return lista[entero(0, lista.length - 1)]
}

async function main() {
  const cliente = new Client({ connectionString: CONNECTION_STRING })
  await cliente.connect()

  console.log('Limpiando tablas y reiniciando contadores...')
  await cliente.query('TRUNCATE TABLE fabricacion, receta_ingrediente, receta, stock, articulo RESTART IDENTITY CASCADE')

  console.log('Insertando artículos (materia_prima)...')
  const idsMateriaPrima = []
  for (const [nombre, unidad] of materiasPrimas) {
    const { rows } = await cliente.query(
      `insert into articulo (nombre, tipo, unidad_medida) values ($1, 'materia_prima', $2) returning id`,
      [nombre, unidad]
    )
    idsMateriaPrima.push(rows[0].id)
  }

  console.log('Insertando artículos (producto_final)...')
  const idsProductoFinal = []
  for (const nombre of productosFinales) {
    const { rows } = await cliente.query(
      `insert into articulo (nombre, tipo, unidad_medida) values ($1, 'producto_final', 'unidades') returning id`,
      [nombre]
    )
    idsProductoFinal.push(rows[0].id)
  }

  const todosLosArticulos = [...idsMateriaPrima, ...idsProductoFinal]
  console.log(`Total artículos: ${todosLosArticulos.length}`)

  console.log('Insertando stock (1 fila base por artículo)...')
  let totalStock = 0
  for (const articuloId of todosLosArticulos) {
    await cliente.query(
      `insert into stock (articulo_id, cantidad, ubicacion) values ($1, $2, $3)`,
      [articuloId, entero(5, 500), elegir(ubicaciones)]
    )
    totalStock++
  }

  console.log('Insertando stock adicional en una segunda ubicación (variedad)...')
  const articulosConSegundaUbicacion = todosLosArticulos
    .slice()
    .sort(() => Math.random() - 0.5)
    .slice(0, 18)
  for (const articuloId of articulosConSegundaUbicacion) {
    await cliente.query(
      `insert into stock (articulo_id, cantidad, ubicacion) values ($1, $2, $3)`,
      [articuloId, entero(5, 200), elegir(ubicaciones)]
    )
    totalStock++
  }
  console.log(`Total stock: ${totalStock}`)

  console.log('Insertando recetas (2 variantes por producto final) e ingredientes...')
  const idsReceta = []
  for (const productoFinalId of idsProductoFinal) {
    const variantes = entero(1, 2)
    for (let v = 0; v < variantes; v++) {
      const { rows } = await cliente.query(
        `insert into receta (producto_final_id) values ($1) returning id`,
        [productoFinalId]
      )
      const recetaId = rows[0].id
      idsReceta.push(recetaId)

      const cantidadIngredientes = entero(2, 4)
      const ingredientesElegidos = idsMateriaPrima
        .slice()
        .sort(() => Math.random() - 0.5)
        .slice(0, cantidadIngredientes)

      for (const articuloId of ingredientesElegidos) {
        await cliente.query(
          `insert into receta_ingrediente (receta_id, articulo_id, cantidad_necesaria) values ($1, $2, $3)`,
          [recetaId, articuloId, Number(aleatorio(0.1, 5).toFixed(2))]
        )
      }
    }
  }
  console.log(`Total recetas: ${idsReceta.length}`)

  console.log('Insertando fabricaciones (fechas distribuidas en los últimos 90 días)...')
  let totalFabricaciones = 0
  const objetivoFabricaciones = 60
  for (let i = 0; i < objetivoFabricaciones; i++) {
    const recetaId = elegir(idsReceta)
    const diasAtras = entero(0, 90)
    const fecha = new Date(Date.now() - diasAtras * 24 * 60 * 60 * 1000)
    await cliente.query(
      `insert into fabricacion (receta_id, cantidad_producir, fecha) values ($1, $2, $3)`,
      [recetaId, entero(1, 50), fecha]
    )
    totalFabricaciones++
  }
  console.log(`Total fabricaciones: ${totalFabricaciones}`)

  console.log('\nVerificación de conteos finales:')
  for (const tabla of ['articulo', 'stock', 'receta', 'receta_ingrediente', 'fabricacion']) {
    const { rows } = await cliente.query(`select count(*) from ${tabla}`)
    console.log(`  ${tabla}: ${rows[0].count}`)
  }

  console.log('\nVerificación de integridad (FK huérfanos):')
  const huerfanosStock = await cliente.query(
    `select count(*) from stock s left join articulo a on a.id = s.articulo_id where a.id is null`
  )
  const huerfanosReceta = await cliente.query(
    `select count(*) from receta r left join articulo a on a.id = r.producto_final_id where a.id is null`
  )
  const huerfanosFabricacion = await cliente.query(
    `select count(*) from fabricacion f left join receta r on r.id = f.receta_id where r.id is null`
  )
  console.log(`  stock huérfano: ${huerfanosStock.rows[0].count}`)
  console.log(`  receta huérfana: ${huerfanosReceta.rows[0].count}`)
  console.log(`  fabricacion huérfana: ${huerfanosFabricacion.rows[0].count}`)

  await cliente.end()
  console.log('\nSeed completado.')
}

main().catch((error) => {
  console.error('Error en el seed:', error)
  process.exit(1)
})
