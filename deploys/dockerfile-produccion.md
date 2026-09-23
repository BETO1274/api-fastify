# Dockerfile desplegado — Producción

- Commit: `8af47b6a57bc81e1f6f1f1cc03ebb8342c80c835`
- Fecha (UTC): 2026-09-23 15:28:45

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
