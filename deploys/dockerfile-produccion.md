# Dockerfile desplegado — Producción

- Commit: `c2b2119de3fceba55fd131e2e43136d102f1b533`
- Fecha (UTC): 2026-09-15 19:06:54

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
