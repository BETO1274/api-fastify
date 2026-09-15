# Dockerfile desplegado — Test

- Commit: `44daebae9b8019935b88202811f217898dda6cde`
- Fecha (UTC): 2026-09-15 18:27:05

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
