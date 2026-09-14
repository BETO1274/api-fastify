# Dockerfile desplegado — Producción

- Commit: `c545d4d8304d51494f1256d28174d9eaa6630335`
- Fecha (UTC): 2026-09-14 18:10:05

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
