#!/usr/bin/env bash
# Sprint 12 — MongoDB full backup
set -euo pipefail
DB_NAME="${DB_NAME:-test_database}"
OUT_DIR="/app/backups"
mkdir -p "$OUT_DIR"
TS=$(date +%Y%m%d_%H%M%S)
TARGET="$OUT_DIR/${DB_NAME}_${TS}"

echo "[backup] mongodump → $TARGET"
mongodump --host localhost:27017 --db "$DB_NAME" --out "$TARGET" --quiet

# tar+gzip
ARCHIVE="$OUT_DIR/${DB_NAME}_${TS}.tar.gz"
tar -czf "$ARCHIVE" -C "$OUT_DIR" "${DB_NAME}_${TS}"
rm -rf "$TARGET"

echo "[backup] ✓ $ARCHIVE ($(du -h $ARCHIVE | cut -f1))"

# Keep only last 10 archives
ls -1t "$OUT_DIR"/${DB_NAME}_*.tar.gz 2>/dev/null | tail -n +11 | xargs -r rm -f
echo "[backup] retention pruned"
