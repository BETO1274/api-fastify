# Dockerfile desplegado — Test

- Commit: `7aefe7b35fb31000c237acb41863eca7869bc783`
- Fecha (UTC): 2026-09-23 15:25:29

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
