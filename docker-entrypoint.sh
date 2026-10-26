#!/bin/sh
# Ponto de entrada da imagem da API. Um modo por papel na stack:
#   api      (padrao) servidor HTTP; e o servico que escala em replicas
#   migrate  aplica as migrations pendentes e sai; roda UMA vez por deploy,
#            antes das replicas, para que duas nao migrem ao mesmo tempo
set -e

case "${1:-api}" in
  api)
    exec node dist/main.js
    ;;
  migrate)
    if [ "${RUN_MIGRATIONS:-true}" != "true" ]; then
      echo "RUN_MIGRATIONS=${RUN_MIGRATIONS}: migrations ignoradas neste deploy."
      exit 0
    fi
    # Falhou → o servico sai com erro e as replicas NAO sobem (depends_on):
    # melhor a versao antiga parada que a nova rodando sobre schema velho.
    exec node node_modules/typeorm/cli.js migration:run \
      -d dist/database/data-source.js
    ;;
  *)
    # Comando avulso (ex.: node dist/cli/auth-bootstrap.js ...).
    exec "$@"
    ;;
esac
