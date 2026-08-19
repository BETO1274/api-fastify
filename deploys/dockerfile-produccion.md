# Dockerfile desplegado — Producción

- Commit: `6776f5ee3ee545d002fac099163eeb5a319ffa2d`
- Fecha (UTC): 2026-08-19 17:29:59

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
