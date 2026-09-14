# Dockerfile desplegado — Test

- Commit: `99451aa4ad92416a09ec99511f43bc8cdbb18e89`
- Fecha (UTC): 2026-09-14 17:45:41

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
