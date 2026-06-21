#!/usr/bin/env bash
# PostgreSQL backup for Cubino — run via cron on Pi
set -euo pipefail
BACKUP_DIR="${BACKUP_DIR:-/home/aryan/backups/cubino}"
mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d_%H%M%S)
pg_dump "${DATABASE_URL:-postgresql://cubino:cubino@localhost:5432/cubino}" \
  | gzip > "$BACKUP_DIR/cubino_${STAMP}.sql.gz"
find "$BACKUP_DIR" -name 'cubino_*.sql.gz' -mtime +14 -delete
echo "Backup saved to $BACKUP_DIR/cubino_${STAMP}.sql.gz"
