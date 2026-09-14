# Dockerfile desplegado — Producción

- Commit: `84faea5d545317fd5b1e7433ab4836f836222917`
- Fecha (UTC): 2026-09-14 18:41:20

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
