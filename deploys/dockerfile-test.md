# Dockerfile desplegado — Test

- Commit: `11dfc859dca4fac79645c2e8229b146559dc32f1`
- Fecha (UTC): 2026-09-14 23:16:41

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
