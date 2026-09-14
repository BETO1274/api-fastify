# Dockerfile desplegado — Producción

- Commit: `a0874f81433d8332e01028e740e86225323cf2bb`
- Fecha (UTC): 2026-09-14 18:31:48

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
