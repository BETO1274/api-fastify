# Dockerfile desplegado — Producción

- Commit: `e95025aff106bbcb5a7cfd2a50c27c8716eb204a`
- Fecha (UTC): 2026-09-19 17:53:08

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
