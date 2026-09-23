# Dockerfile desplegado — Test

- Commit: `f84706fd42562e191a08c5a825182230ba23fb49`
- Fecha (UTC): 2026-09-23 17:53:31

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
