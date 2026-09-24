# Dockerfile desplegado — Producción

- Commit: `2a359483c2af64d9ceb1bb5112b2bd1de4175ba7`
- Fecha (UTC): 2026-09-24 01:35:26

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
