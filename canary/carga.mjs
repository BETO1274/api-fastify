// Generador de carga concurrente contra el router.
//
//   node carga.mjs --router URL --duracion 120 [--concurrencia 10] [--rps 25]
//   node carga.mjs --router URL --duracion 0 --limpiar true
//
// Mezcla lecturas y creaciones de articulos (la creacion alimenta la metrica
// de negocio articulos_creados_total). No guarda cookies: cada peticion es
// independiente, asi el reparto observado coincide con el peso configurado.
// Los articulos creados se llaman "carga-canary-..." y `limpiar` los borra.
import { pathToFileURL } from 'node:url'

const PREFIJO = 'carga-canary'
const dormir = (ms) => new Promise((resolver) => setTimeout(resolver, ms))

async function pedir(base, ruta, opciones = {}) {
  const respuesta = await fetch(`${base}${ruta}`, {
    ...opciones,
    headers: { 'content-type': 'application/json', ...opciones.headers },
    signal: AbortSignal.timeout(20000)
  })
  const texto = await respuesta.text()
  return { status: respuesta.status, ok: respuesta.ok, headers: respuesta.headers, texto }
}

const nuevoArticulo = (sufijo = '') => JSON.stringify({
  nombre: `${PREFIJO}-${sufijo}${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
  tipo: 'materia_prima',
  unidad_medida: 'kg'
})

export async function ejecutarCarga({ router, duracionSeg, concurrencia = 10, rps = 25 }) {
  const base = router.replace(/\/$/, '')
  const fin = Date.now() + duracionSeg * 1000
  const pausa = (concurrencia / rps) * 1000
  const resumen = { total: 0, por_track: {}, por_estado: {}, errores_red: 0 }

  function registrar(respuesta) {
    resumen.total++
    const track = respuesta.headers.get('x-routed-to') ?? 'desconocido'
    resumen.por_track[track] = (resumen.por_track[track] ?? 0) + 1
    const clase = `${Math.floor(respuesta.status / 100)}xx`
    resumen.por_estado[clase] = (resumen.por_estado[clase] ?? 0) + 1
  }

  // Articulo sembrado: las lecturas de la carga apuntan a un id real.
  let idLectura = null
  for (let intento = 0; intento < 5 && !idLectura; intento++) {
    const semilla = await pedir(base, '/articulos', { method: 'POST', body: nuevoArticulo('semilla-') }).catch(() => null)
    if (semilla?.status === 201) idLectura = JSON.parse(semilla.texto).id
  }

  async function trabajador() {
    while (Date.now() < fin) {
      try {
        if (!idLectura || Math.random() < 0.2) {
          registrar(await pedir(base, '/articulos', { method: 'POST', body: nuevoArticulo() }))
        } else {
          registrar(await pedir(base, `/articulos/${idLectura}`))
        }
      } catch {
        resumen.errores_red++
      }
      await dormir(pausa)
    }
  }

  await Promise.all(Array.from({ length: concurrencia }, trabajador))
  return resumen
}

// Borra los articulos de carga. La busqueda usa POST con el header
// x-http-method-override: QUERY (la API lo restaura a QUERY), asi funciona
// aunque un proxy intermedio no deje pasar el verbo QUERY.
export async function limpiar(router) {
  const base = router.replace(/\/$/, '')
  const busqueda = await pedir(base, '/articulos/search', {
    method: 'POST',
    headers: { 'x-http-method-override': 'QUERY' },
    body: JSON.stringify({ nombre: PREFIJO })
  })
  if (!busqueda.ok) return 0

  let borrados = 0
  for (const { id } of JSON.parse(busqueda.texto)) {
    // Con una falla inyectada en el canary algunas peticiones devuelven 500: se reintenta.
    for (let intento = 0; intento < 8; intento++) {
      const r = await pedir(base, `/articulos/${id}`, { method: 'DELETE' }).catch(() => null)
      if (r && (r.status === 204 || r.status === 404)) {
        borrados++
        break
      }
    }
  }
  return borrados
}

function argumentos(lista) {
  const resultado = {}
  for (let i = 0; i < lista.length; i++) {
    if (lista[i].startsWith('--')) resultado[lista[i].slice(2)] = lista[i + 1]
  }
  return resultado
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = argumentos(process.argv.slice(2))
  if (!args.router) {
    console.error('Uso: carga.mjs --router URL --duracion SEGUNDOS [--concurrencia 10] [--rps 25] | --limpiar true')
    process.exit(1)
  }
  if (args.limpiar === 'true') {
    console.log(JSON.stringify({ borrados: await limpiar(args.router) }))
  } else {
    console.log(JSON.stringify(await ejecutarCarga({
      router: args.router,
      duracionSeg: Number(args.duracion ?? 60),
      concurrencia: Number(args.concurrencia ?? 10),
      rps: Number(args.rps ?? 25)
    }), null, 2))
  }
}
