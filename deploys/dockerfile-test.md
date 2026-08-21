# Dockerfile desplegado — Test

- Commit: `3a1b0d9f87ffba669b6cd70e2ad5d1996cf738fb`
- Fecha (UTC): 2026-08-21 16:41:30

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
