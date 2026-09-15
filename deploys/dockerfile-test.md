# Dockerfile desplegado — Test

- Commit: `55afdc8236c568e70498b621e2db6177c9d8c9de`
- Fecha (UTC): 2026-09-15 19:45:16

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
