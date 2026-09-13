# Dockerfile desplegado — Producción

- Commit: `b0877afe758a701f5f738fa8f1f4b6cdac4de40d`
- Fecha (UTC): 2026-09-13 20:15:33

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
