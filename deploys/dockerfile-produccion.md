# Dockerfile desplegado — Producción

- Commit: `3d4584ba466498bcc743ae41e9ab1e56501c25b9`
- Fecha (UTC): 2026-09-19 18:18:19

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
