# Dockerfile desplegado — Test

- Commit: `b14bfafa385f8d4de4e97ca3fdbad2d4aee36d96`
- Fecha (UTC): 2026-09-13 20:06:24

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
