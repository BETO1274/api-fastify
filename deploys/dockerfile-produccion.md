# Dockerfile desplegado — Producción

- Commit: `3b50f1d829206f819f8f85accbd9de46e8bd64e7`
- Fecha (UTC): 2026-08-21 16:51:20

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
