# Dockerfile desplegado — Test

- Commit: `91140a64f9468f556090969d4b885748fc2132b0`
- Fecha (UTC): 2026-09-19 17:39:34

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
