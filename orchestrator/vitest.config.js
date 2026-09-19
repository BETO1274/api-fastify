import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['./test/setup.js'],
    // Estas pruebas tardan milisegundos; el margen amplio evita falsos fallos
    // del primer test (carga en frío) cuando la máquina está muy ocupada.
    testTimeout: 15000
  }
})
