# Dockerfile desplegado — Producción

- Commit: `bdb6d8e52770772f2256d2d2e31a7c4ae071f4ce`
- Fecha (UTC): 2026-08-21 16:49:27

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
