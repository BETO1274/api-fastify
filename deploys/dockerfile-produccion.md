# Dockerfile desplegado — Producción

- Commit: `e7e35916d5ae6056757c4d91f663f5fb9e22189b`
- Fecha (UTC): 2026-09-24 02:01:08

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
