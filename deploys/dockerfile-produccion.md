# Dockerfile desplegado — Producción

- Commit: `a55f9e77f3fb26e4723ebc740032ae45017227e9`
- Fecha (UTC): 2026-09-23 16:31:56

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
