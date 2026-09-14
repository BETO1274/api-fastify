# Dockerfile desplegado — Test

- Commit: `97acdc4266a6c81346141836c8d899499d92fd33`
- Fecha (UTC): 2026-09-14 18:38:59

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
