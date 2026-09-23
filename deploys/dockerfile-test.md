# Dockerfile desplegado — Test

- Commit: `17978fe42498bf9d404de2976435d4ef105151e1`
- Fecha (UTC): 2026-09-23 15:15:10

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
