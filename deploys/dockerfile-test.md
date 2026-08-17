# Dockerfile desplegado — Test

- Commit: `7616ed3f844d05a24d13c0a90883f834b59c9fc6`
- Fecha (UTC): 2026-08-17 03:08:00

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
