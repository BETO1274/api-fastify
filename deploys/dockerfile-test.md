# Dockerfile desplegado — Test

- Commit: `8a2b3ad3217de9c3ca901d4afb3bbf8ffcb86d7d`
- Fecha (UTC): 2026-09-24 01:47:03

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
