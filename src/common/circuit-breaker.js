// Circuit breaker para las llamadas a las APIs externas del equipo.
//
// Tras N fallos consecutivos de la dependencia deja de llamarla (el circuito
// se "abre") y responde de inmediato; pasado un enfriamiento deja pasar UNA
// sola petición de prueba y, si funciona, vuelve a la normalidad. Así una
// dependencia caída o lenta no arrastra latencia a cada petición.
//
// Solo cuentan como falla las de la dependencia (timeout, conexión, 5xx,
// respuesta inválida). Un 4xx no abre el circuito: la API sí respondió.
//
// El estado vive en memoria de cada réplica: con 2 réplicas, cada una abre el
// suyo según lo que ella observa.
import { circuitBreakerEstado, circuitBreakerRechazosTotal } from './metricas.js'

const ESTADO_NUMERICO = { cerrado: 0, semiabierto: 1, abierto: 2 }

export class ErrorDependencia extends Error {
  constructor(tipo, mensaje, { status, cuentaParaCircuito = true } = {}) {
    super(mensaje)
    this.name = 'ErrorDependencia'
    this.tipo = tipo
    this.status = status
    this.cuentaParaCircuito = cuentaParaCircuito
  }
}

export class CircuitBreaker {
  #servicio
  #umbralFallos
  #enfriamientoMs
  #ahora
  #estado = 'cerrado'
  #fallosConsecutivos = 0
  #abiertoDesde = 0
  #sondaEnCurso = false

  constructor({ servicio, umbralFallos, enfriamientoMs, ahora = Date.now }) {
    this.#servicio = servicio
    this.#umbralFallos = umbralFallos
    this.#enfriamientoMs = enfriamientoMs
    this.#ahora = ahora
    this.#publicarEstado()
  }

  get estado() {
    return this.#estado
  }

  async ejecutar(accion) {
    this.#antesDeLlamar()
    const esSonda = this.#estado === 'semiabierto'
    try {
      const resultado = await accion()
      this.#registrarExito()
      return resultado
    } catch (error) {
      if (error instanceof ErrorDependencia && !error.cuentaParaCircuito) {
        this.#registrarExito()
      } else {
        this.#registrarFallo()
      }
      throw error
    } finally {
      if (esSonda) this.#sondaEnCurso = false
    }
  }

  #antesDeLlamar() {
    if (this.#estado === 'abierto') {
      if (this.#ahora() - this.#abiertoDesde < this.#enfriamientoMs) this.#rechazar()
      this.#cambiarEstado('semiabierto')
    }
    if (this.#estado === 'semiabierto') {
      // Una sola petición de prueba a la vez; el resto sigue rechazada hasta
      // saber si la dependencia se recuperó.
      if (this.#sondaEnCurso) this.#rechazar()
      this.#sondaEnCurso = true
    }
  }

  #rechazar() {
    circuitBreakerRechazosTotal.inc({ servicio: this.#servicio })
    throw new ErrorDependencia('circuito_abierto', `circuito abierto para ${this.#servicio}`, { cuentaParaCircuito: false })
  }

  #registrarExito() {
    this.#fallosConsecutivos = 0
    if (this.#estado !== 'cerrado') this.#cambiarEstado('cerrado')
  }

  #registrarFallo() {
    if (this.#estado === 'semiabierto') {
      this.#abrir()
      return
    }
    this.#fallosConsecutivos += 1
    if (this.#fallosConsecutivos >= this.#umbralFallos) this.#abrir()
  }

  #abrir() {
    this.#abiertoDesde = this.#ahora()
    this.#fallosConsecutivos = 0
    this.#cambiarEstado('abierto')
  }

  #cambiarEstado(nuevo) {
    this.#estado = nuevo
    this.#publicarEstado()
  }

  #publicarEstado() {
    circuitBreakerEstado.set({ servicio: this.#servicio }, ESTADO_NUMERICO[this.#estado])
  }
}

// Un circuito por dependencia.
const circuitos = new Map()

export function obtenerCircuito(servicio, { umbralFallos, enfriamientoMs }) {
  if (!circuitos.has(servicio)) {
    circuitos.set(servicio, new CircuitBreaker({ servicio, umbralFallos, enfriamientoMs }))
  }
  return circuitos.get(servicio)
}

// Solo para pruebas.
export function reiniciarCircuitos() {
  circuitos.clear()
}
