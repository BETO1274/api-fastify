# Dockerfile desplegado — Producción

- Commit: `9c9094b25ff3db74cb25eb9dd8bed0e88183774d`
- Fecha (UTC): 2026-09-24 00:59:38

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
