# Dockerfile desplegado — Producción

- Commit: `1fa198f3230f41cf3b4b854da3d5bf26286113b4`
- Fecha (UTC): 2026-09-14 17:31:58

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
