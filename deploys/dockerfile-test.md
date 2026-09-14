# Dockerfile desplegado — Test

- Commit: `084c5d254d1e611c16e108a2990662f110ef611f`
- Fecha (UTC): 2026-09-14 03:50:14

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
