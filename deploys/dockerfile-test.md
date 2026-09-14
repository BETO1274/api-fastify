# Dockerfile desplegado — Test

- Commit: `560e081c66497f7fc8a9ad5a5f90f142a75d76d9`
- Fecha (UTC): 2026-09-14 17:40:24

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
