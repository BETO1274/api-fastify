# Dockerfile desplegado — Test

- Commit: `a3f958c516ec19e0278ac4bd6fbd08dfc8a81773`
- Fecha (UTC): 2026-09-24 01:52:28

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
