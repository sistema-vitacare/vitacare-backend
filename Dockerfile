# syntax=docker/dockerfile:1
#
# Duas imagens a partir deste arquivo (o CI publica as duas no GHCR):
#   --target runtime  API NestJS; escala em replicas (servicos api e migrate)
#   --target gateway  nginx que distribui os requests entre as replicas
# Sem --target, o build gera a API (ultimo estagio).

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

# ---------- gateway: nginx de borda da stack
# `resolve` no upstream (re-resolucao das replicas) exige nginx >= 1.27.3.
FROM nginx:1.30-alpine AS gateway
# O default.conf da imagem escutaria na 80 com outro server.
RUN rm -f /etc/nginx/conf.d/default.conf
COPY confs/gateway/nginx.conf /etc/nginx/conf.d/vitacare.conf
# Falha no BUILD, nao em producao: sintaxe e diretivas conferidas aqui. O
# `api` nao existe no build; com `resolve` o nginx aceita o nome mesmo assim.
RUN nginx -t
EXPOSE 1040
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:1040/gateway/health >/dev/null || exit 1

# ---------- runtime: API
FROM node:22-alpine AS runtime
WORKDIR /app

# dumb-init encaminha sinais e recolhe zumbis mesmo quando o container roda
# sem --init (Portainer, docker run cru).
RUN apk add --no-cache dumb-init

ENV NODE_ENV=production
# Porta interna fixa: o upstream do gateway depende dela ser previsivel.
ENV PORT=3000

COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./package.json
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health/live >/dev/null || exit 1

ENTRYPOINT ["dumb-init", "--", "docker-entrypoint.sh"]
CMD ["api"]

# Prova de versao no ar: GET /api/v1 devolve este commit e o deploy espera por
# ele. Por ultimo: muda a cada build e invalidaria o cache das camadas acima.
ARG GIT_SHA=dev
ENV APP_VERSION=$GIT_SHA
