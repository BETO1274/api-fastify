# Dockerfile desplegado — Producción

- Commit: `b5a5739c9b15c92315d336e354a3a24493c0873c`
- Fecha (UTC): 2026-09-16 22:16:45

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
