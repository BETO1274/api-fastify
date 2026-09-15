# Dockerfile desplegado — Producción

- Commit: `28e66073f318e36b59b6773993ad2876b1bb5e08`
- Fecha (UTC): 2026-09-15 19:48:24

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
