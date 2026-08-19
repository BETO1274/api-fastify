# Dockerfile desplegado — Test

- Commit: `68672452045bbd772597c09a5a2e2cbbe80416ef`
- Fecha (UTC): 2026-08-19 17:27:52

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
