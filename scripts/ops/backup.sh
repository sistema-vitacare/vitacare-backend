#!/bin/sh
# Backup diario do VitaCare (BE-25): banco E anexos na mesma execucao, porque
# so se restauram juntos (RPO 24 h). Cron do root na VPS, uma linha:
#
#   20 3 * * * KUMA_PUSH_URL=http://127.0.0.1:3001/api/push/<token> /opt/vitacare/backup.sh >> /var/log/vitacare-backup.log 2>&1
#
# Cria $BACKUP_DIR/vitacare-<AAAA-MM-DDTHHMM>/ com db.dump (pg_dump -Fc),
# storage.tgz (volume de anexos, sem tmp/) e SHA256SUMS, so para o root.
# Apaga as pastas com mais de RETENTION_DAYS dias. O Kuma so e avisado se
# tudo deu certo: backup que falha em silencio vira alerta (monitor Push 25 h).
#
# A API continua no ar. Ordem dump -> tar: um upload no intervalo vira no
# maximo um arquivo orfao (storage-orphans.js lista); uma remocao no intervalo
# deixaria linha sem arquivo (ATTACHMENT_CONTENT_MISSING) — rara as 03:20.
set -eu
umask 077

PG_CONTAINER=${PG_CONTAINER:-postgresql}
PG_SUPERUSER=${PG_SUPERUSER:-mavila}
DB_NAME=${DB_NAME:-vitacare}
STORAGE_VOLUME=${STORAGE_VOLUME:-vitacare_vitacare-storage}
BACKUP_DIR=${BACKUP_DIR:-/root/backups/vitacare}
RETENTION_DAYS=${RETENTION_DAYS:-14}
KUMA_PUSH_URL=${KUMA_PUSH_URL:-}
ALPINE_IMAGE=${ALPINE_IMAGE:-alpine:3.22}

docker volume inspect "$STORAGE_VOLUME" >/dev/null 2>&1 || {
  echo "Volume $STORAGE_VOLUME nao existe (docker volume ls | grep vitacare)." >&2
  exit 1
}

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

target="$BACKUP_DIR/vitacare-$(date +%Y-%m-%dT%H%M)"
partial="$target.partial"
rm -rf "$partial"
mkdir "$partial"
trap 'rm -rf "$partial"' EXIT

docker exec "$PG_CONTAINER" pg_dump -U "$PG_SUPERUSER" -Fc "$DB_NAME" > "$partial/db.dump"
docker run --rm -v "$STORAGE_VOLUME:/d:ro" "$ALPINE_IMAGE" \
  tar czf - -C /d --exclude ./tmp . > "$partial/storage.tgz"
(cd "$partial" && sha256sum db.dump storage.tgz > SHA256SUMS)

rm -rf "$target"
mv "$partial" "$target"
trap - EXIT

find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name 'vitacare-*' \
  -mtime +"$RETENTION_DAYS" -exec rm -rf {} +

echo "backup em $target"
du -h "$target"/db.dump "$target"/storage.tgz

if [ -n "$KUMA_PUSH_URL" ]; then
  curl -fsS -m 10 -o /dev/null "$KUMA_PUSH_URL" || echo "aviso: Uptime Kuma nao recebeu o push" >&2
fi
