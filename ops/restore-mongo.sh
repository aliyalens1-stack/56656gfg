#!/usr/bin/env bash
# Sprint 12 — MongoDB restore from backup archive
set -euo pipefail
ARCHIVE="${1:-}"
DB_NAME="${DB_NAME:-test_database}"

if [[ -z "$ARCHIVE" ]] || [[ ! -f "$ARCHIVE" ]]; then
    echo "Usage: $0 <path-to-backup.tar.gz>"
    echo ""
    echo "Available backups:"
    ls -1t /app/backups/*.tar.gz 2>/dev/null | head -10 || echo "  (none)"
    exit 1
fi

WORK=$(mktemp -d)
echo "[restore] extracting $ARCHIVE → $WORK"
tar -xzf "$ARCHIVE" -C "$WORK"

# the archive contains DB_NAME_TS/DB_NAME/*.bson
SUBDIR=$(ls -d $WORK/*/ | head -1)
if [[ -z "$SUBDIR" ]]; then
    echo "[restore] ERROR: could not locate dump directory"
    rm -rf "$WORK"
    exit 1
fi

echo "[restore] mongorestore --drop --db $DB_NAME from $SUBDIR$DB_NAME"
mongorestore --host localhost:27017 --drop --db "$DB_NAME" "$SUBDIR$DB_NAME" --quiet

rm -rf "$WORK"
echo "[restore] ✓ database $DB_NAME restored"
