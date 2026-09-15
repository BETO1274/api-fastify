# Dockerfile desplegado — Test

- Commit: `ba741a18d077dc7fada37855bcc1aa7d38096e94`
- Fecha (UTC): 2026-09-15 19:17:56

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
