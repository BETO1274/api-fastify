# Dockerfile desplegado — Test

- Commit: `658e4056c5be17cd937f16aebbb583dae3fbc616`
- Fecha (UTC): 2026-09-23 16:30:47

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
