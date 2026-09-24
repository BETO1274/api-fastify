# Dockerfile desplegado — Test

- Commit: `aa61eab615b528d29cded04433e7d0b00b1ec902`
- Fecha (UTC): 2026-09-24 01:06:10

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
