# Dockerfile desplegado — Producción

- Commit: `8b4f15e6ea37c6ff753eb01ec3c531425ae7f325`
- Fecha (UTC): 2026-08-17 03:10:39

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
