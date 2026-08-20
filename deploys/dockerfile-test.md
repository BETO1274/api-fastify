# Dockerfile desplegado — Test

- Commit: `0a19a31d3acb505fab4d0baec1c852118517fb31`
- Fecha (UTC): 2026-08-20 00:51:02

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
