# Dockerfile desplegado — Producción

- Commit: `e5b8ff1d9e2e6c5c1c45ce6caf7f99ab4e02977c`
- Fecha (UTC): 2026-09-15 19:20:29

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
