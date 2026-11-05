FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

# Identidad del artefacto: la devuelven las respuestas (X-App-Version / X-Track)
ARG APP_VERSION=dev
ARG APP_TRACK=stable
ENV APP_VERSION=$APP_VERSION APP_TRACK=$APP_TRACK

EXPOSE 3000

USER node

CMD ["node", "src/server.js"]
