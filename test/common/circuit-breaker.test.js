import { afterEach, describe, expect, it } from 'vitest'
import { CircuitBreaker, ErrorDependencia, obtenerCircuito, reiniciarCircuitos } from '../../src/common/circuit-breaker.js'

// Reloj controlable: las pruebas no esperan tiempo real.
function crearReloj(inicio = 0) {
  let ahora = inicio
  return { ahora: () => ahora, avanzar: (ms) => { ahora += ms } }
}

const falla = () => Promise.reject(new ErrorDependencia('http_5xx', 'caída', { status: 500 }))
const exito = () => Promise.resolve('ok')

function nuevoCircuito(reloj, extra = {}) {
  return new CircuitBreaker({ servicio: 'prueba', umbralFallos: 3, enfriamientoMs: 1000, ahora: reloj.ahora, ...extra })
}

async function intentar(circuito, accion) {
  try {
    return await circuito.ejecutar(accion)
  } catch (error) {
    return error
  }
}

afterEach(() => reiniciarCircuitos())

describe('CircuitBreaker', () => {
  it('empieza cerrado y deja pasar las llamadas', async () => {
    const circuito = nuevoCircuito(crearReloj())

    expect(circuito.estado).toBe('cerrado')
    expect(await circuito.ejecutar(exito)).toBe('ok')
  })

  it('se abre tras N fallos consecutivos y rechaza sin llamar a la dependencia', async () => {
    const circuito = nuevoCircuito(crearReloj())
    let llamadas = 0
    const contada = () => { llamadas += 1; return falla() }

    for (let i = 0; i < 3; i++) await intentar(circuito, contada)
    const rechazo = await intentar(circuito, contada)

    expect(circuito.estado).toBe('abierto')
    expect(llamadas).toBe(3)
    expect(rechazo).toMatchObject({ tipo: 'circuito_abierto', cuentaParaCircuito: false })
  })

  it('un éxito reinicia la cuenta de fallos consecutivos', async () => {
    const circuito = nuevoCircuito(crearReloj())

    await intentar(circuito, falla)
    await intentar(circuito, falla)
    await circuito.ejecutar(exito)
    await intentar(circuito, falla)
    await intentar(circuito, falla)

    expect(circuito.estado).toBe('cerrado')
  })

  it('tras el enfriamiento deja pasar una sola prueba y cierra si funciona', async () => {
    const reloj = crearReloj()
    const circuito = nuevoCircuito(reloj)
    for (let i = 0; i < 3; i++) await intentar(circuito, falla)

    reloj.avanzar(999)
    expect((await intentar(circuito, exito)).tipo).toBe('circuito_abierto')

    reloj.avanzar(1)
    expect(await circuito.ejecutar(exito)).toBe('ok')
    expect(circuito.estado).toBe('cerrado')
  })

  it('si la prueba falla, vuelve a abrirse', async () => {
    const reloj = crearReloj()
    const circuito = nuevoCircuito(reloj)
    for (let i = 0; i < 3; i++) await intentar(circuito, falla)

    reloj.avanzar(1000)
    await intentar(circuito, falla)

    expect(circuito.estado).toBe('abierto')
  })

  it('en semiabierto solo permite una petición de prueba a la vez', async () => {
    const reloj = crearReloj()
    const circuito = nuevoCircuito(reloj)
    for (let i = 0; i < 3; i++) await intentar(circuito, falla)
    reloj.avanzar(1000)

    let liberar
    const lenta = () => new Promise((resolver) => { liberar = () => resolver('ok') })
    const sonda = circuito.ejecutar(lenta)
    const segunda = await intentar(circuito, exito)
    liberar()
    await sonda

    expect(circuito.estado).toBe('cerrado')
    expect(segunda.tipo).toBe('circuito_abierto')
  })

  it('un error 4xx (la dependencia respondió) no abre el circuito', async () => {
    const circuito = nuevoCircuito(crearReloj())
    const noEncontrado = () => Promise.reject(new ErrorDependencia('http_4xx', '404', { status: 404, cuentaParaCircuito: false }))

    for (let i = 0; i < 10; i++) await intentar(circuito, noEncontrado)

    expect(circuito.estado).toBe('cerrado')
  })

  it('un error inesperado (no ErrorDependencia) cuenta como falla', async () => {
    const circuito = nuevoCircuito(crearReloj(), { umbralFallos: 2 })
    const raro = () => Promise.reject(new Error('inesperado'))

    await intentar(circuito, raro)
    await intentar(circuito, raro)

    expect(circuito.estado).toBe('abierto')
  })
})

describe('obtenerCircuito', () => {
  it('reutiliza el mismo circuito por servicio y los separa entre servicios', () => {
    const config = { umbralFallos: 3, enfriamientoMs: 1000 }

    expect(obtenerCircuito('a', config)).toBe(obtenerCircuito('a', config))
    expect(obtenerCircuito('a', config)).not.toBe(obtenerCircuito('b', config))
  })
})
