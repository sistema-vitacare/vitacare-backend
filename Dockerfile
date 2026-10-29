# syntax=docker/dockerfile:1

FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json package-lock.json nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS production-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---------- runtime: API
FROM node:22-alpine AS runtime
WORKDIR /app

# dumb-init encaminha sinais e recolhe zumbis mesmo quando o container roda
# sem --init (Portainer, docker run cru).
RUN apk add --no-cache dumb-init

ENV NODE_ENV=production
# Porta da VPS: a mesma dentro e fora do container (molde da VPS). O
# compose.yaml de desenvolvimento sobrepoe com PORT=3000.
ENV PORT=1050

COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./package.json
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

USER node
EXPOSE 1050

# $PORT: vale tanto na VPS (1050) quanto no compose de desenvolvimento (3000).
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health/live" >/dev/null || exit 1

ENTRYPOINT ["dumb-init", "--", "docker-entrypoint.sh"]
CMD ["api"]

# Prova de versao no ar: GET /api/v1 devolve este commit e o deploy espera por
# ele. Por ultimo: muda a cada build e invalidaria o cache das camadas acima.
ARG GIT_SHA=dev
ENV APP_VERSION=$GIT_SHA
