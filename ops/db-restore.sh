#!/usr/bin/env bash
# db-restore.sh <backup.tar.gz>
set -euo pipefail
BACKUP="${1:?usage: $0 <path-to-backup.tar.gz>}"
[[ -f "$BACKUP" ]] || { echo "Not found: $BACKUP"; exit 1; }

MONGO_URL=$(grep -E "^MONGO_URL=" /app/backend/.env | cut -d= -f2- | tr -d '"')
DB_NAME=$(grep -E "^DB_NAME=" /app/backend/.env | cut -d= -f2- | tr -d '"' || echo "auto_search")
[[ -z "$DB_NAME" ]] && DB_NAME="auto_search"

TMP=$(mktemp -d)
trap "rm -rf $TMP" EXIT
tar xzf "$BACKUP" -C "$TMP"
DUMP_DIR=$(ls -d "$TMP"/*/)
echo "[db-restore] restoring $BACKUP → $DB_NAME (drop + insert)"
mongorestore --uri="$MONGO_URL" --db="$DB_NAME" --drop "$DUMP_DIR$DB_NAME" --quiet
echo "[db-restore] ✓ done. Restart backend: sudo supervisorctl restart backend"
