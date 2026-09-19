// Las pruebas nunca deben depender de variables que existan en el entorno de
// quien las corre: cada prueba fija las que necesita.
delete process.env.TEAM_API_KEY
delete process.env.ORQUESTADOR_URL
