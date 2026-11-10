#!/bin/sh
# Restauracao do VitaCare (BE-25): banco E volume de anexos do MESMO backup,
# nunca um so. RTO alvo: 4 h do incidente a API no ar.
#
#   restore.sh <pasta-do-backup> --yes [--target-db <banco>] [--target-volume <volume>]
#
# Padrao: sobrescreve o banco `vitacare` e o volume `vitacare_vitacare-storage`.
# O banco e restaurado ao lado (<banco>__incoming) e so troca de lugar com o
# alvo depois do pg_restore completo: uma falha deixa o banco atual intacto.
# Pare a stack antes (Portainer -> Stacks -> vitacare -> Stop): o script recusa
# volume em uso, e o DROP falha se houver conexao no banco. Para ensaiar sem
# tocar em producao, use --target-db vitacare_restore --target-volume vitacare-restore.
set -eu

PG_CONTAINER=${PG_CONTAINER:-postgresql}
PG_SUPERUSER=${PG_SUPERUSER:-mavila}
DB_OWNER=${DB_OWNER:-vitacare}
ALPINE_IMAGE=${ALPINE_IMAGE:-alpine:3.22}
# Usuario `node` da imagem da API: dono dos anexos.
STORAGE_UID=${STORAGE_UID:-1000}

die() {
  echo "restore: $*" >&2
  exit 1
}

backup=""
confirmed=0
target_db=${DB_NAME:-vitacare}
target_volume=${STORAGE_VOLUME:-vitacare_vitacare-storage}
volume_given=0

while [ $# -gt 0 ]; do
  case "$1" in
    --yes) confirmed=1 ;;
    --target-db) target_db=$2; shift ;;
    --target-volume) target_volume=$2; volume_given=1; shift ;;
    -*) die "opcao desconhecida: $1" ;;
    *) backup=$1 ;;
  esac
  shift
done

[ -n "$backup" ] && [ -d "$backup" ] || die "informe a pasta do backup (vitacare-<data>)."
[ -f "$backup/db.dump" ] && [ -f "$backup/storage.tgz" ] && [ -f "$backup/SHA256SUMS" ] ||
  die "a pasta precisa de db.dump, storage.tgz e SHA256SUMS."
[ "$confirmed" = 1 ] ||
  die "isto APAGA o banco $target_db e o volume $target_volume. Repita com --yes."

(cd "$backup" && sha256sum -c --quiet SHA256SUMS) || die "SHA256SUMS nao confere: backup corrompido."

in_use=$(docker ps --filter "volume=$target_volume" --format '{{.Names}}')
[ -z "$in_use" ] || die "o volume $target_volume esta montado em: $in_use. Pare a stack antes."
# Volume padrao inexistente = nome errado: restaurar o banco contra outro volume
# deixaria linhas sem arquivo. Volume novo so quando informado de proposito.
if [ "$volume_given" = 0 ] && ! docker volume inspect "$target_volume" >/dev/null 2>&1; then
  die "o volume $target_volume nao existe (docker volume ls | grep vitacare); informe --target-volume."
fi

sql() {
  docker exec "$PG_CONTAINER" psql -U "$PG_SUPERUSER" -d postgres -v ON_ERROR_STOP=1 -qtA -c "$1"
}

[ "$(sql "SELECT count(*) FROM pg_roles WHERE rolname = '$DB_OWNER'")" = 1 ] ||
  die "o role $DB_OWNER nao existe no PostgreSQL."

incoming="${target_db}__incoming"
started=$(date +%s)

sql "DROP DATABASE IF EXISTS \"$incoming\"" >/dev/null
sql "CREATE DATABASE \"$incoming\" OWNER \"$DB_OWNER\"" >/dev/null
if ! docker exec -i "$PG_CONTAINER" pg_restore -U "$PG_SUPERUSER" --no-owner --role="$DB_OWNER" \
  --exit-on-error -d "$incoming" < "$backup/db.dump"; then
  sql "DROP DATABASE IF EXISTS \"$incoming\"" >/dev/null || true
  die "pg_restore falhou; o banco $target_db nao foi alterado."
fi
# DROP sem FORCE: com conexao aberta no alvo, falha aqui e o alvo fica intacto.
if ! sql "DROP DATABASE IF EXISTS \"$target_db\"" >/dev/null; then
  sql "DROP DATABASE IF EXISTS \"$incoming\"" >/dev/null || true
  die "o banco $target_db tem conexao aberta; pare a stack antes. Nada foi alterado."
fi
sql "ALTER DATABASE \"$incoming\" RENAME TO \"$target_db\"" >/dev/null

docker volume create "$target_volume" >/dev/null
docker run --rm -i -v "$target_volume:/d" "$ALPINE_IMAGE" sh -c \
  "find /d -mindepth 1 -delete && tar xzf - -C /d && mkdir -p /d/tmp && chown -R $STORAGE_UID:$STORAGE_UID /d" \
  < "$backup/storage.tgz"

echo "restaurado em $(($(date +%s) - started)) s: banco $target_db, volume $target_volume"
