# Dockerfile desplegado — Test

- Commit: `e99d2d551f880473e0d002ae49c29dd553b52246`
- Fecha (UTC): 2026-09-24 01:32:48

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
