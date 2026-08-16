import Fastify from 'fastify'

const app = Fastify({
  logger: true
})

const PORT = process.env.PORT || 3000

app.listen({ port: PORT, host: '0.0.0.0' }, (error) => {
  if (error) {
    app.log.error(error)
    process.exit(1)
  }
})
