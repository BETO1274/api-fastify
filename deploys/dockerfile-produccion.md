# Dockerfile desplegado — Producción

- Commit: `213685d5888b541dd0e70a03394f89df39a5570c`
- Fecha (UTC): 2026-09-24 01:33:17

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
