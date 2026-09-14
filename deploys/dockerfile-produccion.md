# Dockerfile desplegado — Producción

- Commit: `baf4f625353e0ed75c2f808d8823eee0223b989c`
- Fecha (UTC): 2026-09-14 03:52:20

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
