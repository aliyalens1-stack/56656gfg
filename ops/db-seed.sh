#!/usr/bin/env bash
# db-seed.sh — re-run seed (restart FastAPI runs startup_event with seed logic)
set -euo pipefail
echo "[db-seed] restarting backend → FastAPI startup_event повторно заполнит missing-collections"
sudo supervisorctl restart backend
sleep 12
MONGO_URL=$(grep -E "^MONGO_URL=" /app/backend/.env | cut -d= -f2- | tr -d '"')
DB_NAME=$(grep -E "^DB_NAME=" /app/backend/.env | cut -d= -f2- | tr -d '"' || echo "auto_search")
[[ -z "$DB_NAME" ]] && DB_NAME="auto_search"

echo "[db-seed] Counts after seed:"
mongosh --quiet "$MONGO_URL/$DB_NAME" --eval '
const cols = ["users","organizations","services","service_categories","zones","zone_snapshots","reviews","provider_locations","automation_rules","feedback_rules"];
for (const c of cols) {
  try {
    print(`   ${c.padEnd(25)} ${db.getCollection(c).countDocuments()}`);
  } catch(e) { print(`   ${c}: ERR`); }
}
' 2>/dev/null || echo "   (mongosh недоступен — пропустил count)"
echo "[db-seed] ✓ done"
