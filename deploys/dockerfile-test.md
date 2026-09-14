# Dockerfile desplegado — Test

- Commit: `b1724e0d727a0b0b19c850bca66fa8e15ce50892`
- Fecha (UTC): 2026-09-14 18:45:00

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
