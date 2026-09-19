# Dockerfile desplegado — Producción

- Commit: `c0a5dbe3f0a8dcab3a954a536d8596cb2afec3f8`
- Fecha (UTC): 2026-09-19 17:42:09

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
