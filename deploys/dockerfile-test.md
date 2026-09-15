# Dockerfile desplegado — Test

- Commit: `76898721c4bdee23d12f197ae2f234240c666381`
- Fecha (UTC): 2026-09-15 19:04:19

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
