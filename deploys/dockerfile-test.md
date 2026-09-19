# Dockerfile desplegado — Test

- Commit: `5defffacd032228283bcb094459b65b854b227c4`
- Fecha (UTC): 2026-09-19 18:43:23

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
