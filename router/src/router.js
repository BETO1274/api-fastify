import http from 'node:http'
import https from 'node:https'
import { randomUUID } from 'node:crypto'
import { crearMetricas } from './metricas.js'

const TIMEOUT_MS = 30000

function leerCookie(cabecera, nombre) {
  for (const par of String(cabecera ?? '').split(';')) {
    const [clave, ...resto] = par.trim().split('=')
    if (clave === nombre) return resto.join('=')
  }
  return null
}

function responderJson(res, codigo, cuerpo) {
  res.writeHead(codigo, { 'content-type': 'application/json' })
  res.end(JSON.stringify(cuerpo))
}

function leerCuerpo(req) {
  return new Promise((resolver, rechazar) => {
    const partes = []
    req.on('data', (parte) => partes.push(parte))
    req.on('end', () => resolver(Buffer.concat(partes).toString()))
    req.on('error', rechazar)
  })
}

// Crea el servidor del router. `random` se inyecta para poder probar la
// distribucion de forma determinista.
export function crearRouter({
  stableUrl,
  canaryUrl,
  pesoInicial = 0,
  adminKey = '',
  random = Math.random,
  logs = { registrar() {} }
}) {
  const destinos = { stable: new URL(stableUrl), canary: new URL(canaryUrl) }
  const metricas = crearMetricas()
  const estado = { pesoCanary: pesoInicial }
  metricas.peso.set(estado.pesoCanary)

  // Decision de enrutamiento, por prioridad:
  //  1. x-canary: true  -> canary (etapa 0, pruebas internas con 0% publico)
  //  2. cookie sticky   -> el track asignado antes (solo si el peso es > 0;
  //                        con peso 0 se ignora para que el rollback sea inmediato)
  //  3. sorteo ponderado segun el porcentaje configurado
  function decidir(req) {
    if (String(req.headers['x-canary']).toLowerCase() === 'true') {
      return { track: 'canary', motivo: 'header' }
    }
    if (estado.pesoCanary > 0) {
      const sticky = leerCookie(req.headers.cookie, 'track')
      if (sticky === 'canary' || sticky === 'stable') {
        return { track: sticky, motivo: 'sticky' }
      }
    }
    const track = random() * 100 < estado.pesoCanary ? 'canary' : 'stable'
    return { track, motivo: 'ponderado', asignar: estado.pesoCanary > 0 }
  }

  async function admin(req, res) {
    if (!adminKey || req.headers['x-admin-key'] !== adminKey) {
      return responderJson(res, 401, { mensaje: 'x-admin-key inválida o ausente' })
    }
    if (req.method === 'GET') {
      return responderJson(res, 200, { canary_weight: estado.pesoCanary })
    }
    if (req.method === 'POST') {
      let cuerpo
      try {
        cuerpo = JSON.parse(await leerCuerpo(req))
      } catch {
        return responderJson(res, 400, { mensaje: 'Cuerpo JSON inválido' })
      }
      const peso = cuerpo.canary_weight
      if (!Number.isFinite(peso) || peso < 0 || peso > 100) {
        return responderJson(res, 400, { mensaje: 'canary_weight debe estar entre 0 y 100' })
      }
      estado.pesoCanary = peso
      metricas.peso.set(peso)
      return responderJson(res, 200, { canary_weight: peso })
    }
    return responderJson(res, 405, { mensaje: 'Método no permitido' })
  }

  function reenviar(req, res, { track, motivo, asignar }, idPeticion) {
    const inicio = process.hrtime.bigint()
    const ruta = req.url.split('?')[0]
    const destino = destinos[track]
    const cliente = destino.protocol === 'https:' ? https : http
    // 'accept-encoding: identity': el borde de Render agrega gzip/br a la peticion y la API
    // respondia comprimida, con lo que el mensaje de error se registraba como bytes de Brotli.
    // El router no necesita compresion; el borde comprime hacia el cliente si hace falta.
    const cabeceras = { ...req.headers, host: destino.host, 'x-request-id': idPeticion, 'accept-encoding': 'identity' }
    cabeceras['x-forwarded-for'] = [req.headers['x-forwarded-for'], req.socket.remoteAddress]
      .filter(Boolean)
      .join(', ')

    let contado = false
    const terminar = (codigo) => {
      if (contado) return
      contado = true
      const segundos = Number(process.hrtime.bigint() - inicio) / 1e9
      metricas.peticiones.inc({ track, reason: motivo, status_class: `${Math.floor(codigo / 100)}xx` })
      metricas.duracion.observe({ track }, segundos)
    }

    const salida = cliente.request({
      protocol: destino.protocol,
      hostname: destino.hostname,
      port: destino.port || undefined,
      path: req.url,
      method: req.method,
      headers: cabeceras,
      timeout: TIMEOUT_MS
    }, (respuesta) => {
      const headers = { ...respuesta.headers, 'x-routed-to': track, 'x-route-reason': motivo, 'x-request-id': idPeticion }
      if (asignar) headers['set-cookie'] = `track=${track}; Max-Age=300; Path=/; SameSite=Lax`
      res.writeHead(respuesta.statusCode, headers)

      // Los errores 5xx se registran con el mensaje puntual (primeros 300 caracteres del cuerpo).
      let fragmento = ''
      if (respuesta.statusCode >= 500) {
        respuesta.on('data', (parte) => {
          if (fragmento.length < 300) fragmento += parte.toString().slice(0, 300 - fragmento.length)
        })
      }
      respuesta.pipe(res)
      respuesta.on('end', () => {
        terminar(respuesta.statusCode)
        if (respuesta.statusCode >= 500) {
          logs.registrar('error', {
            track,
            version: respuesta.headers['x-app-version'] ?? 'desconocida',
            status: respuesta.statusCode,
            method: req.method,
            path: ruta,
            request_id: idPeticion,
            reason: motivo,
            error: fragmento || `HTTP ${respuesta.statusCode}`
          })
        }
      })
    })

    const fallar = (codigo, mensaje) => {
      metricas.erroresUpstream.inc({ track })
      logs.registrar('error', {
        track,
        version: 'desconocida',
        status: codigo,
        method: req.method,
        path: ruta,
        request_id: idPeticion,
        reason: motivo,
        error: mensaje
      })
      if (!res.headersSent) {
        res.writeHead(codigo, { 'content-type': 'application/json', 'x-routed-to': track, 'x-request-id': idPeticion })
        res.end(JSON.stringify({ mensaje }))
      }
      terminar(codigo)
    }
    salida.on('timeout', () => {
      salida.destroy()
      fallar(504, `El servicio ${track} no respondió a tiempo`)
    })
    salida.on('error', () => fallar(502, `No se pudo contactar el servicio ${track}`))
    req.pipe(salida)
  }

  const servidor = http.createServer(async (req, res) => {
    const ruta = req.url.split('?')[0]
    if (ruta === '/router/health') return responderJson(res, 200, { status: 'ok' })
    if (ruta === '/router/metrics') {
      res.writeHead(200, { 'content-type': metricas.registro.contentType })
      return res.end(await metricas.registro.metrics())
    }
    if (ruta === '/router/weight') return admin(req, res)
    reenviar(req, res, decidir(req), req.headers['x-request-id'] || randomUUID())
  })

  return { servidor, estado }
}
