# Dockerfile desplegado — Test

- Commit: `9ee8370ff5bf50b4b3c927f0636dbeee1f451c44`
- Fecha (UTC): 2026-08-20 00:19:20

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
