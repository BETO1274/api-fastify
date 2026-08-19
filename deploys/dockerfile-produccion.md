# Dockerfile desplegado — Producción

- Commit: `1c3054b68c4f29c501b3243b4ffc59ccb9f7ddfe`
- Fecha (UTC): 2026-08-19 15:32:11

```dockerfile
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

EXPOSE 3000

USER node

CMD ["node", "src/server.js"]
```
