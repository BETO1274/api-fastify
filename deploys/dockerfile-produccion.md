# Dockerfile desplegado — Producción

- Commit: `f20a4f3fb7c05ef1ae6b2efca96392ebee6cffb2`
- Fecha (UTC): 2026-09-23 15:19:02

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
