#!/bin/sh
# Restauracao do VitaCare (BE-25): banco E volume de anexos do MESMO backup,
# nunca um so. RTO alvo: 4 h do incidente a API no ar.
#
#   restore.sh <pasta-do-backup> --yes [--target-db <banco>] [--target-volume <volume>]
#
# Padrao: sobrescreve o banco `vitacare` e o volume `vitacare_vitacare-storage`.
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

while [ $# -gt 0 ]; do
  case "$1" in
    --yes) confirmed=1 ;;
    --target-db) target_db=$2; shift ;;
    --target-volume) target_volume=$2; shift ;;
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

started=$(date +%s)

docker exec "$PG_CONTAINER" psql -U "$PG_SUPERUSER" -d postgres -v ON_ERROR_STOP=1 -q \
  -c "DROP DATABASE IF EXISTS \"$target_db\"" \
  -c "CREATE DATABASE \"$target_db\" OWNER \"$DB_OWNER\""
docker exec -i "$PG_CONTAINER" pg_restore -U "$PG_SUPERUSER" --no-owner --role="$DB_OWNER" \
  --exit-on-error -d "$target_db" < "$backup/db.dump"

docker volume create "$target_volume" >/dev/null
docker run --rm -i -v "$target_volume:/d" "$ALPINE_IMAGE" sh -c \
  "find /d -mindepth 1 -delete && tar xzf - -C /d && mkdir -p /d/tmp && chown -R $STORAGE_UID:$STORAGE_UID /d" \
  < "$backup/storage.tgz"

echo "restaurado em $(($(date +%s) - started)) s: banco $target_db, volume $target_volume"
