#!/bin/sh
# Homologacao efemera da IMAGEM (BE-25): o mesmo roteiro no CI e no ensaio
# local. Tudo que cria e desfeito no fim (containers, volumes, bancos).
#
#   1. sobe a imagem com os limites de producao; o entrypoint aplica as migrations
#   2. cria o master pelo seed, como no primeiro deploy
#   3. smoke completo por HTTP (escrita, so aqui)
#   4. backup -> restauracao em banco e volume novos -> segundo container -> verify
#   5. revert + migrate da ultima migration -> verify
#   6. rollback: a imagem anterior (ROLLBACK_IMAGE, a que esta em producao)
#      sobre o schema novo -> read + verify; incompatibilidade so avisa
#
# Variaveis: IMAGE (obrigatoria), ROLLBACK_IMAGE, EXPECT_VERSION, PG_CONTAINER
# (container do Postgres, para pg_dump/psql), DB_HOST, DB_PORT, DB_USERNAME,
# DB_PASSWORD, REDIS_HOST, REDIS_PORT. A rede e a do host (--network host).
set -eu

IMAGE=${IMAGE:?Defina IMAGE}
ROLLBACK_IMAGE=${ROLLBACK_IMAGE:-}
EXPECT_VERSION=${EXPECT_VERSION:-}
PG_CONTAINER=${PG_CONTAINER:?Defina PG_CONTAINER}
DB_HOST=${DB_HOST:-127.0.0.1}
DB_PORT=${DB_PORT:-5432}
DB_USERNAME=${DB_USERNAME:-vitacare}
DB_PASSWORD=${DB_PASSWORD:?Defina DB_PASSWORD}
REDIS_HOST=${REDIS_HOST:-127.0.0.1}
REDIS_PORT=${REDIS_PORT:-6379}

here=$(cd "$(dirname "$0")" && pwd)
run="hml$$"
work=$(mktemp -d)
main_db="vitacare_${run}"
restore_db="vitacare_${run}_restore"
smoke_password="senha definitiva da homologacao"

summary() {
  echo "$1"
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then echo "$1" >> "$GITHUB_STEP_SUMMARY"; fi
}

psql_admin() {
  docker exec "$PG_CONTAINER" psql -U "$DB_USERNAME" -d postgres -v ON_ERROR_STOP=1 -q -c "$1"
}

cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then
    for name in "$run-api" "$run-restore" "$run-rollback"; do
      if docker ps -a --format '{{.Names}}' | grep -qx "$name"; then
        echo "--- ultimas linhas de $name"
        docker logs --tail 40 "$name" 2>&1 || true
      fi
    done
  fi
  docker rm -f "$run-api" "$run-restore" "$run-rollback" >/dev/null 2>&1 || true
  docker volume rm "$run-storage" "$run-restore-storage" >/dev/null 2>&1 || true
  psql_admin "DROP DATABASE IF EXISTS \"$main_db\" WITH (FORCE)" >/dev/null 2>&1 || true
  psql_admin "DROP DATABASE IF EXISTS \"$restore_db\" WITH (FORCE)" >/dev/null 2>&1 || true
  rm -rf "$work"
  exit "$status"
}
trap cleanup EXIT

start_api() { # nome porta banco volume imagem
  docker run -d --name "$1" --network host --memory 512m --cpus 1 \
    -v "$4:/app/storage" \
    -e PORT="$2" -e RUN_MIGRATIONS=true -e TRUST_PROXY=false -e THROTTLE_LIMIT=100000 \
    -e DB_HOST="$DB_HOST" -e DB_PORT="$DB_PORT" -e DB_USERNAME="$DB_USERNAME" \
    -e DB_PASSWORD="$DB_PASSWORD" -e DB_DATABASE="$3" \
    -e REDIS_HOST="$REDIS_HOST" -e REDIS_PORT="$REDIS_PORT" \
    -e REDIS_KEY_PREFIX="$1:" -e QUEUE_PREFIX="$1" \
    "$5" >/dev/null
}

smoke() { # porta modo [args...]
  port=$1
  mode=$2
  shift 2
  node "$here/smoke.mjs" --base-url "http://127.0.0.1:$port" --mode "$mode" \
    --state-file "$work/smoke-state.json" "$@"
}

summary "## Homologacao efemera da imagem"
summary ""

# 1-2. Implantacao do zero e seed
psql_admin "CREATE DATABASE \"$main_db\""
docker volume create "$run-storage" >/dev/null
start_api "$run-api" 1050 "$main_db" "$run-storage" "$IMAGE"
if [ -n "$EXPECT_VERSION" ]; then
  smoke 1050 read --wait 120 --expect-version "$EXPECT_VERSION"
else
  smoke 1050 read --wait 120
fi
summary "- implantacao: $(docker logs "$run-api" 2>&1 | grep -c 'executed successfully') migrations pelo entrypoint, smoke de leitura ok"

docker exec "$run-api" node dist/cli/seed-platform.js \
  --organization-code plataforma-hml --trade-name VitaCare \
  --admin-name "Master Homologacao" --admin-email master@plataforma-hml.example.test \
  --admin-cpf 11144477735 > "$work/seed.out"
master_password=$(sed -n 's/^senha provisoria (exibida uma unica vez): //p' "$work/seed.out")
rm -f "$work/seed.out"
[ -n "$master_password" ] || { echo "seed sem senha provisoria" >&2; exit 1; }
if [ "${GITHUB_ACTIONS:-}" = "true" ]; then echo "::add-mask::$master_password"; fi

export SMOKE_PLATFORM_CODE=plataforma-hml SMOKE_MASTER_EMAIL=master@plataforma-hml.example.test
export SMOKE_MASTER_PASSWORD="$master_password" SMOKE_ADMIN_PASSWORD="$smoke_password"

# 3. Jornada completa
smoke 1050 full --allow-writes
summary "- smoke completo (UC01, 03, 05, 06, 07, 09, 10, 11, 13, 14, anexo, isolamento, logout): ok"

# 4. Backup e restauracao
PG_SUPERUSER="$DB_USERNAME" DB_NAME="$main_db" STORAGE_VOLUME="$run-storage" \
  BACKUP_DIR="$work/backups" "$here/backup.sh"
backup=$(ls -d "$work"/backups/vitacare-*)
restore_started=$(date +%s)
PG_SUPERUSER="$DB_USERNAME" DB_OWNER="$DB_USERNAME" \
  "$here/restore.sh" "$backup" --yes --target-db "$restore_db" --target-volume "$run-restore-storage"
start_api "$run-restore" 1051 "$restore_db" "$run-restore-storage" "$IMAGE"
smoke 1051 read --wait 120 > /dev/null
smoke 1051 verify
summary "- backup e restauracao em banco e volume novos: verify ok, $(($(date +%s) - restore_started)) s da restauracao a API respondendo"
docker rm -f "$run-restore" >/dev/null

# 5. Revert e migrate da ultima migration, com a API parada
docker stop "$run-api" >/dev/null
migration_env="-e DB_HOST=$DB_HOST -e DB_PORT=$DB_PORT -e DB_USERNAME=$DB_USERNAME -e DB_DATABASE=$main_db -e REDIS_HOST=$REDIS_HOST"
# shellcheck disable=SC2086
docker run --rm --network host $migration_env -e DB_PASSWORD="$DB_PASSWORD" "$IMAGE" revert
# shellcheck disable=SC2086
docker run --rm --network host $migration_env -e DB_PASSWORD="$DB_PASSWORD" "$IMAGE" migrate
docker start "$run-api" >/dev/null
smoke 1050 read --wait 120 > /dev/null
smoke 1050 verify
summary "- revert + migrate da ultima migration: verify ok"

# 6. Rollback de imagem sobre o schema novo
if [ -z "$ROLLBACK_IMAGE" ] || [ "$ROLLBACK_IMAGE" = "$IMAGE" ]; then
  summary "- rollback de imagem: sem imagem anterior informada (aviso, nao reprova)"
elif ! docker pull -q "$ROLLBACK_IMAGE" >/dev/null 2>&1 && ! docker image inspect "$ROLLBACK_IMAGE" >/dev/null 2>&1; then
  summary "- rollback de imagem: $ROLLBACK_IMAGE indisponivel (aviso, nao reprova)"
else
  docker stop "$run-api" >/dev/null
  start_api "$run-rollback" 1052 "$main_db" "$run-storage" "$ROLLBACK_IMAGE"
  if smoke 1052 read --wait 120 && smoke 1052 verify; then
    summary "- rollback para $ROLLBACK_IMAGE sobre o schema novo: read e verify ok"
  else
    summary "- **aviso:** $ROLLBACK_IMAGE NAO roda sobre o schema novo; rollback desta versao so por revert ou restauracao"
    if [ "${GITHUB_ACTIONS:-}" = "true" ]; then echo "::warning::Rollback de imagem incompativel com o schema novo"; fi
  fi
fi

summary ""
summary "Homologacao concluida: ambiente descartado."
