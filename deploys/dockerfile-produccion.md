# Dockerfile desplegado — Producción

- Commit: `4b2802ddfbb33004cb682516f9ccda1f38dfd3cc`
- Fecha (UTC): 2026-09-23 17:42:32

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
