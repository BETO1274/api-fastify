# Dockerfile desplegado — Test

- Commit: `27bc25fc8832144c66b3f7481cc88a7ce0d564b1`
- Fecha (UTC): 2026-08-19 15:30:09

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
