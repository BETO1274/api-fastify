# Dockerfile desplegado — Producción

- Commit: `33671f6c61a4a796405f1521b6dc4398b1b21b84`
- Fecha (UTC): 2026-09-15 12:10:26

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
