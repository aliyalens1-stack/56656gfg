#!/usr/bin/env bash
# Sprint 12 — End-to-end production readiness check
# Ordering matters: all auth-required tests run BEFORE the rate-limit test,
# because the rate-limit test intentionally poisons /api/auth/login for 60s.
set -uo pipefail
BASE="${BACKEND_URL:-http://localhost:8001}"
OPS="$(cd "$(dirname "$0")" && pwd)"
# Pick up DB_NAME from backend/.env so smoke-data-consistency works
if [[ -z "${DB_NAME:-}" ]] && [[ -f /app/backend/.env ]]; then
    export DB_NAME=$(grep -E "^DB_NAME=" /app/backend/.env | head -1 | cut -d= -f2- | tr -d '"')
fi
export DB_NAME="${DB_NAME:-test_database}"

PASS=0
FAIL=0
green() { echo -e "  \033[1;32m✓\033[0m $*"; PASS=$((PASS+1)); }
red()   { echo -e "  \033[1;31m✗\033[0m $*"; FAIL=$((FAIL+1)); }
section() { echo -e "\n\033[1;36m▶ $*\033[0m"; }

echo "🏁 Production Readiness Check"
echo "   BASE=$BASE  DB=$DB_NAME"

# ── 1. Basic health
section "1. Health"
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/health")
[[ "$code" == "200" ]] && green "/api/health → 200" || red "/api/health → $code"

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/system/health")
[[ "$code" == "200" ]] && green "/api/system/health → 200" || red "/api/system/health → $code"

# ── 2. Smoke scripts
section "2. Smoke scripts"
for s in smoke-contracts smoke-api-contracts smoke-realtime check-deprecated-collections smoke-data-consistency smoke-errors; do
    if bash "$OPS/$s.sh" >/dev/null 2>&1; then
        green "$s.sh"
    else
        red   "$s.sh failed"
    fi
done

ADMIN_JWT=$(curl -s -X POST "$BASE/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d '{"email":"admin@autoservice.com","password":"Admin123!"}' \
    | jq -r '.accessToken // empty')

# ── 3. Idempotency
section "3. Idempotency"
if [[ -z "$ADMIN_JWT" ]]; then
    red "Could not obtain admin JWT (aborting idempotency test)"
else
    KEY="idem-$(date +%s)-$$-$RANDOM"
    body='{"lat":50.45,"lng":30.52,"serviceType":"diagnostics","vehicleId":"v1"}'

    size1=$(curl -s -X POST "$BASE/api/marketplace/quick-request" \
        -H "Authorization: Bearer $ADMIN_JWT" \
        -H "Idempotency-Key: $KEY" \
        -H 'Content-Type: application/json' \
        -d "$body" -o /tmp/r1.json -w "%{size_download}")
    hdrs=$(curl -sD - -X POST "$BASE/api/marketplace/quick-request" \
        -H "Authorization: Bearer $ADMIN_JWT" \
        -H "Idempotency-Key: $KEY" \
        -H 'Content-Type: application/json' \
        -d "$body" -o /tmp/r2.json)
    size2=$(stat -c%s /tmp/r2.json 2>/dev/null || echo 0)

    if [[ "$size1" == "$size2" ]] && [[ "$size1" -gt 0 ]] && echo "$hdrs" | grep -qi "x-idempotent-replay"; then
        green "Replay returns cached response ($size1 bytes, x-idempotent-replay header)"
    else
        red "Replay mismatch (size1=$size1 size2=$size2)"
    fi
fi

# ── 4. Circuit breaker state
section "4. Circuit breaker state"
if [[ -n "$ADMIN_JWT" ]]; then
    resp=$(curl -s -H "Authorization: Bearer $ADMIN_JWT" "$BASE/api/system/breaker")
    state=$(echo "$resp" | jq -r '.nestjs.state // empty')
    if [[ -n "$state" ]]; then
        green "Breaker state endpoint ok (state=$state)"
    else
        red   "Breaker state endpoint failed"
    fi
fi

# ── 5. Alert dispatcher
section "5. Alert dispatcher"
if [[ -n "$ADMIN_JWT" ]]; then
    curl -s -X POST "$BASE/api/system/test-alert" \
        -H "Authorization: Bearer $ADMIN_JWT" \
        -H 'Content-Type: application/json' \
        -d '{"level":"info","code":"E2E_TEST","message":"production check alert"}' > /dev/null
    count=$(curl -s -H "Authorization: Bearer $ADMIN_JWT" "$BASE/api/system/alert-dispatches?limit=5" \
        | jq -r '.total // 0')
    if [[ "$count" -gt 0 ]]; then
        green "Alert dispatched (recent count=$count)"
    else
        red   "Alert dispatch not recorded"
    fi
fi

# ── 6. Audit trail
section "6. Audit trail"
if [[ -n "$ADMIN_JWT" ]]; then
    curl -s -X POST "$BASE/api/admin/zones/kyiv-center/override" \
        -H "Authorization: Bearer $ADMIN_JWT" \
        -H 'Content-Type: application/json' \
        -d '{"mode":"FORCE_BALANCED","fanout":3,"ttlSeconds":60}' > /dev/null
    curl -s -X DELETE "$BASE/api/admin/zones/kyiv-center/override" \
        -H "Authorization: Bearer $ADMIN_JWT" > /dev/null

    audit_count=$(curl -s -H "Authorization: Bearer $ADMIN_JWT" \
        "$BASE/api/system/audit?action=zone.override.apply&limit=5" \
        | jq -r '.total // 0')
    if [[ "$audit_count" -gt 0 ]]; then
        green "Audit log records zone.override.apply ($audit_count entries)"
    else
        red   "Audit log missing zone.override.apply"
    fi
fi

# ── 7. Backup scripts
section "7. Backup scripts"
[[ -x "$OPS/backup-mongo.sh" ]]   && green "backup-mongo.sh exists & executable" || red "backup-mongo.sh missing"
[[ -x "$OPS/restore-mongo.sh" ]]  && green "restore-mongo.sh exists & executable" || red "restore-mongo.sh missing"
[[ -x "$OPS/cleanup-ttl.sh" ]]    && green "cleanup-ttl.sh exists & executable" || red "cleanup-ttl.sh missing"

# Do a dry-run backup for verification
if bash "$OPS/backup-mongo.sh" > /tmp/backup.log 2>&1; then
    green "backup-mongo.sh produced an archive"
else
    red "backup-mongo.sh failed (see /tmp/backup.log)"
fi

# ── 8. Security audit
section "8. Security audit"
if bash "$OPS/security-audit.sh" >/dev/null 2>&1; then
    green "security-audit.sh passed"
else
    red   "security-audit.sh failed"
fi

# ── 9. Rate limit (runs LAST; uses external URL to bypass loopback exemption)
section "9. Rate limit — POST /api/auth/login (limit 5/min)"
EXT_URL="${EXPO_PUBLIC_BACKEND_URL:-}"
if [[ -z "$EXT_URL" ]] && [[ -f /app/frontend/.env ]]; then
    EXT_URL=$(grep -E "^EXPO_PUBLIC_BACKEND_URL=" /app/frontend/.env | head -1 | cut -d= -f2-)
fi
EXT_URL="${EXT_URL:-$BASE}"
bad_code=""
for i in $(seq 1 8); do
    bad_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$EXT_URL/api/auth/login" \
        -H 'Content-Type: application/json' \
        -d '{"email":"nonexistent@test.com","password":"xxx"}')
done
if [[ "$bad_code" == "429" ]]; then
    green "Rate limit triggered via $EXT_URL (last attempt → 429)"
else
    red   "Rate limit not triggered via $EXT_URL (got $bad_code, expected 429)"
fi

# ── Summary
echo ""
echo "───────────────────────────────────────"
if [[ $FAIL -eq 0 ]]; then
    echo -e "\033[1;32m✓ PRODUCTION CHECK PASSED — $PASS/$((PASS+FAIL))\033[0m"
    exit 0
else
    echo -e "\033[1;31m✗ PRODUCTION CHECK FAILED — $FAIL issue(s), $PASS passed\033[0m"
    exit 1
fi
