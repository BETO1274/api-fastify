# Dockerfile desplegado — Producción

- Commit: `cff300d5bbb53c5ed61130a110b94d11ed22fb52`
- Fecha (UTC): 2026-09-14 18:14:56

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
