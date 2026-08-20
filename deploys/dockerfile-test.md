# Dockerfile desplegado — Test

- Commit: `50276d487fa3be9a6850e43d351d5af12b5f80e9`
- Fecha (UTC): 2026-08-20 00:41:38

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
