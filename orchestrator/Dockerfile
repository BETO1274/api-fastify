# Una sola imagen para dos procesos: el servidor HTTP (por defecto) y el
# worker (en K8s se arranca con command: ["node", "src/worker.js"]).
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

EXPOSE 3100

USER node

CMD ["node", "src/server.js"]
