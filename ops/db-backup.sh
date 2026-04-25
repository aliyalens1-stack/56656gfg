#!/usr/bin/env bash
# db-backup.sh — mongodump → /app/backups/<ts>.tar.gz
set -euo pipefail
TS=$(date +%Y%m%d_%H%M%S)
BACKUPS_DIR=/app/backups
DIR="$BACKUPS_DIR/$TS"
mkdir -p "$BACKUPS_DIR"

MONGO_URL=$(grep -E "^MONGO_URL=" /app/backend/.env | cut -d= -f2- | tr -d '"')
DB_NAME=$(grep -E "^DB_NAME=" /app/backend/.env | cut -d= -f2- | tr -d '"' || echo "auto_search")
[[ -z "$DB_NAME" ]] && DB_NAME="auto_search"

echo "[db-backup] MONGO_URL=$MONGO_URL db=$DB_NAME → $DIR"
mongodump --uri="$MONGO_URL" --db="$DB_NAME" --out="$DIR" --quiet
tar czf "$DIR.tar.gz" -C "$BACKUPS_DIR" "$TS"
rm -rf "$DIR"
echo "[db-backup] ✓ $DIR.tar.gz ($(du -h $DIR.tar.gz | cut -f1))"

# keep last 10 backups
ls -1t "$BACKUPS_DIR"/*.tar.gz 2>/dev/null | tail -n +11 | xargs -r rm -f
echo "[db-backup] Active backups:"
ls -lh "$BACKUPS_DIR"/*.tar.gz 2>/dev/null | awk '{printf "   %s  %s  %s\n", $5, $6" "$7" "$8, $9}'
