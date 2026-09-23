// Las pruebas corren siempre en modo memoria y sin cola, sin importar qué
// variables existan en el entorno de quien las corre (por ejemplo, el
// DATABASE_URL que definen los pipelines de CI para la API principal).
delete process.env.DATABASE_URL
delete process.env.SERVICEBUS_CONNECTION_STRING
delete process.env.TEAM_API_KEY
