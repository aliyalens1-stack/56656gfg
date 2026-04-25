#!/usr/bin/env bash
# db-reset.sh — ПОЛНЫЙ сброс БД + пересоздание seed
# ВНИМАНИЕ: УДАЛЯЕТ ВСЁ.
set -euo pipefail
read -p "⚠️  Это полностью удалит БД. Введите 'yes' для продолжения: " confirm
[[ "$confirm" == "yes" ]] || { echo "Отменено."; exit 1; }

MONGO_URL=$(grep -E "^MONGO_URL=" /app/backend/.env | cut -d= -f2- | tr -d '"')
DB_NAME=$(grep -E "^DB_NAME=" /app/backend/.env | cut -d= -f2- | tr -d '"' || echo "auto_search")
[[ -z "$DB_NAME" ]] && DB_NAME="auto_search"

echo "[db-reset] dropping database $DB_NAME..."
mongosh --quiet "$MONGO_URL/$DB_NAME" --eval "db.dropDatabase()"
echo "[db-reset] restarting backend (seed)..."
sudo supervisorctl restart backend
sleep 15
bash "$(dirname "$0")/health.sh" || true
