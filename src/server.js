import { existsSync } from 'node:fs'

if (existsSync('.env')) {
  process.loadEnvFile('.env')
}

const { buildApp } = await import('./app.js')

const app = buildApp()
const PORT = process.env.PORT || 3000

app.listen({ port: PORT, host: '0.0.0.0' }, (error) => {
  if (error) {
    app.log.error(error)
    process.exit(1)
  }
})
