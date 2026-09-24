# Dockerfile desplegado — Producción

- Commit: `6d67d59aa90648ccc1cd08fe2417994bcd6cface`
- Fecha (UTC): 2026-09-24 01:51:13

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
