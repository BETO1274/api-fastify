# Dockerfile desplegado — Producción

- Commit: `821f5075488c7cfbd108823572425fe4a987037a`
- Fecha (UTC): 2026-09-13 21:06:00

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
