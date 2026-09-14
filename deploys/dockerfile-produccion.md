# Dockerfile desplegado — Producción

- Commit: `9705513402ff1464e6139bdca7e0665e25b8a3f7`
- Fecha (UTC): 2026-09-14 18:47:33

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
