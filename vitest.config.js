import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // orchestrator/ es un proyecto Node independiente, con su propio
    // package.json, node_modules y suite de pruebas (npm test dentro de esa
    // carpeta) — no debe ser recogido por el vitest de la raíz.
    exclude: ['**/node_modules/**', 'orchestrator/**'],
    setupFiles: ['./test/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      include: ['src/**'],
      exclude: ['src/server.js']
    }
  }
})
