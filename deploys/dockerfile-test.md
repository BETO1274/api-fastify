# Dockerfile desplegado — Test

- Commit: `57616161a778857d13926ef23e8572165a9e334a`
- Fecha (UTC): 2026-09-24 03:53:10

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
