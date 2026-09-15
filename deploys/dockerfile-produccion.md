# Dockerfile desplegado — Producción

- Commit: `4be19b23807c7bb97ecafe0c1beaac72361c64fa`
- Fecha (UTC): 2026-09-15 18:30:24

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
