# Dockerfile desplegado — Producción

- Commit: `65a40611a98fa31c6ad22ab52fb97e2fccc17b18`
- Fecha (UTC): 2026-09-13 22:28:35

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
