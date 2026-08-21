# Dockerfile desplegado — Test

- Commit: `2ee00ac7a74449eb7e0d1d795e837cf233a4cfd7`
- Fecha (UTC): 2026-08-21 16:43:03

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
