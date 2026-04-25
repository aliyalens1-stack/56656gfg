#!/usr/bin/env bash
# Sprint 12 — Verify/force TTL indexes on transient collections
set -euo pipefail
DB_NAME="${DB_NAME:-test_database}"
MONGO="${MONGO_URL:-mongodb://localhost:27017}"

echo "[ttl] Ensuring TTL indexes on $DB_NAME"

mongosh "$MONGO/$DB_NAME" --quiet --eval '
const colls = ["password_reset_tokens", "realtime_events", "idempotency_keys",
               "alert_dispatches", "system_logs"];
for (const c of colls) {
    try {
        const idx = db[c].createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "ttl_expiresAt" });
        print("  ✓ " + c + "  → " + idx);
    } catch (e) {
        print("  ! " + c + "  → " + e.message);
    }
}
// Report counts for orientation
print("");
print("[ttl] Current document counts:");
for (const c of colls) {
    try { print("  " + c + ": " + db[c].countDocuments({})); } catch(e) {}
}
'
echo "[ttl] ✓ complete"
