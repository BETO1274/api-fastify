# Dockerfile desplegado — Test

- Commit: `7fbf21726fc349ae519063cbe04580335c7681bb`
- Fecha (UTC): 2026-09-13 20:13:42

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
