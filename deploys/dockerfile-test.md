# Dockerfile desplegado — Test

- Commit: `b49a512dfaf942ba96924f65ce34fbd7b3a3ea3a`
- Fecha (UTC): 2026-09-14 18:29:20

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
