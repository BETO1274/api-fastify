# Dockerfile desplegado — Test

- Commit: `f8050bf0362cc40244c3fb0546be9634d80175c2`
- Fecha (UTC): 2026-09-24 02:00:00

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
