# Dockerfile desplegado — Test

- Commit: `2fcd90b4eb23421810b0d14dfd53c16f3eb77181`
- Fecha (UTC): 2026-08-19 23:18:30

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
