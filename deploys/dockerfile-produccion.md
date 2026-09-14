# Dockerfile desplegado — Producción

- Commit: `d62e221d0c9ccd1c7b6ce131f90b917acf64bb96`
- Fecha (UTC): 2026-09-14 23:21:06

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
