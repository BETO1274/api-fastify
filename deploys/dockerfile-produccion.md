# Dockerfile desplegado — Producción

- Commit: `468e0b6439a73d600921fcc2273cc505fb1ad92b`
- Fecha (UTC): 2026-09-24 00:55:08

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
