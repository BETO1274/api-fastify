# Dockerfile desplegado — Producción

- Commit: `e941e7c333c975032736b62f77a2121b5423e5ad`
- Fecha (UTC): 2026-09-24 01:24:55

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
