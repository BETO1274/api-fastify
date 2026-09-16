# Dockerfile desplegado — Test

- Commit: `a466796b475fe69369fb7737e2cd3e65696a6245`
- Fecha (UTC): 2026-09-16 12:46:52

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
