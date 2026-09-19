import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // orchestrator/ y gateway/ son proyectos Node independientes, cada uno con
    // su propio package.json, node_modules y suite de pruebas (npm test dentro
    // de cada carpeta) — no deben ser recogidos por el vitest de la raíz.
    exclude: ['**/node_modules/**', 'orchestrator/**', 'gateway/**'],
    setupFiles: ['./test/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      include: ['src/**'],
      exclude: ['src/server.js']
    }
  }
})
