# Dockerfile desplegado — Producción

- Commit: `63d046693e22e952eae93c3d08eb079b9ec9bf92`
- Fecha (UTC): 2026-09-19 18:48:23

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
