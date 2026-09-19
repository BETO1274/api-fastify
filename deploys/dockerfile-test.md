# Dockerfile desplegado — Test

- Commit: `84477615f0568deb9bf2bc759ce4122100a20a32`
- Fecha (UTC): 2026-09-19 18:15:41

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
