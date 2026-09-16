# Dockerfile desplegado — Producción

- Commit: `14caea0a4ee0c0d0ae8a62ffb9ab3787d592dea3`
- Fecha (UTC): 2026-09-16 12:49:28

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
