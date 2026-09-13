# Dockerfile desplegado — Producción

- Commit: `911cbbb0e9a9c2e10c2209b54ef01b944ca0ebcc`
- Fecha (UTC): 2026-09-13 20:08:15

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
