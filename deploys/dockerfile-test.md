# Dockerfile desplegado — Test

- Commit: `7d595640af15afc498f2deb7ac93b7cd61df29d5`
- Fecha (UTC): 2026-09-13 22:26:02

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
