# Dockerfile desplegado — Test

- Commit: `66e8a9753da3219723644dc4a650233a9f37be2f`
- Fecha (UTC): 2026-09-15 12:06:58

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
