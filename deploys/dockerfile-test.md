# Dockerfile desplegado — Test

- Commit: `d6d9e2197050968cf5a413350fd1522fe74d305f`
- Fecha (UTC): 2026-09-23 21:51:13

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
