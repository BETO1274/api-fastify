# Dockerfile desplegado — Test

- Commit: `8679cef4a03d76e650eff1ed1762400db8622ce6`
- Fecha (UTC): 2026-09-19 17:50:48

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
