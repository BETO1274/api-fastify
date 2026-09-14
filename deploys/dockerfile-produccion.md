# Dockerfile desplegado — Producción

- Commit: `dbfab27c493bf0e0b44502449cb1ba97fa3c298b`
- Fecha (UTC): 2026-09-14 17:42:26

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
