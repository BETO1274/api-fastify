# Dockerfile desplegado — Test

- Commit: `fc51d22ceab90af6c0526d49f960eec859c2ecc3`
- Fecha (UTC): 2026-09-14 18:11:39

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
