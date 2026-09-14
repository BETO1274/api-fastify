# Dockerfile desplegado — Test

- Commit: `693299d87a1168325574ab13ccf5dc5a138b9908`
- Fecha (UTC): 2026-09-14 17:29:26

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
