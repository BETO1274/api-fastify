# Dockerfile desplegado — Producción

- Commit: `b352cc54fbe08727df91d4a9860b2a96063e01da`
- Fecha (UTC): 2026-08-19 23:42:33

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
