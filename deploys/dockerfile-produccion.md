# Dockerfile desplegado — Producción

- Commit: `e0069bf7356b274ef3655b5165620695d402896b`
- Fecha (UTC): 2026-09-14 17:47:46

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
