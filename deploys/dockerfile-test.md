# Dockerfile desplegado — Test

- Commit: `7bdc988acb8d9ca875fe129d707be6568ff7a861`
- Fecha (UTC): 2026-09-14 18:07:40

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
