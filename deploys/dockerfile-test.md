# Dockerfile desplegado — Test

- Commit: `127d3d0381da5159430221ee1e6af59e6bd193ab`
- Fecha (UTC): 2026-09-16 22:14:32

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
