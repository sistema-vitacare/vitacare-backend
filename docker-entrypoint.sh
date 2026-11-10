#!/bin/sh
# Ponto de entrada da imagem da API (container unico, como no molde Laravel):
#   api      (padrao) aplica as migrations pendentes se RUN_MIGRATIONS=true e
#            sobe o servidor HTTP
#   migrate  so aplica as migrations e sai (uso manual)
#   revert   desfaz UMA migration (a ultima) e sai; nunca automatico
set -e

# Migration longa nao pode morrer no statement_timeout da API, e uma conexao
# basta. As variaveis valem so para este comando.
typeorm_migration() {
  DB_STATEMENT_TIMEOUT_MS=0 DB_POOL_SIZE=1 DB_APPLICATION_NAME=vitacare-migrate \
    node node_modules/typeorm/cli.js "migration:$1" -d dist/database/data-source.js
}

run_migrations() {
  typeorm_migration run
}

case "${1:-api}" in
  api)
    # Container unico, sem replica: migrate a cada deploy e seguro e
    # idempotente. Falhou → o container nao sobe e o erro fica no log (melhor
    # que a versao nova rodando sobre schema velho). Padrao desligado: em
    # desenvolvimento (compose.yaml) nada migra sozinho.
    if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
      run_migrations
    fi
    # exec: o Node vira o processo principal e recebe o SIGTERM do deploy.
    exec node dist/main.js
    ;;
  migrate)
    run_migrations
    ;;
  revert)
    # O `down` pode apagar dados da migration desfeita: so com backup recente
    # (scripts/ops/backup.sh) e a API parada ou na imagem anterior.
    typeorm_migration revert
    ;;
  *)
    # Comando avulso (ex.: node dist/cli/seed-platform.js ...).
    exec "$@"
    ;;
esac
