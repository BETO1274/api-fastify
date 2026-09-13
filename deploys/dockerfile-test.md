# Dockerfile desplegado — Test

- Commit: `95c280fd9910956c179399c0f05f6254049343d1`
- Fecha (UTC): 2026-09-13 21:04:21

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
