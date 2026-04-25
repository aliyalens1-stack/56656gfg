#!/usr/bin/env bash
# Sprint 12 — Security audit: verify no open critical endpoints
set -uo pipefail
BASE="${BACKEND_URL:-http://localhost:8001}"

PASS=0
FAIL=0
green() { echo -e "  \033[1;32m✓\033[0m $*"; }
red()   { echo -e "  \033[1;31m✗\033[0m $*"; }

expect_unauth() {
    # $1 method, $2 path
    local method="$1"
    local path="$2"
    local code
    if [[ "$method" == "GET" ]]; then
        code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
    else
        code=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "$BASE$path" -H 'Content-Type: application/json' -d '{}')
    fi
    if [[ "$code" == "401" ]] || [[ "$code" == "403" ]]; then
        green "$method $path → $code (auth required)"
        PASS=$((PASS+1))
    else
        red "$method $path → $code (expected 401/403)"
        FAIL=$((FAIL+1))
    fi
}

echo "🔒 Security audit — checking protected endpoints"
echo "   BASE=$BASE"
echo ""

# FastAPI admin endpoints
expect_unauth GET  /api/system/errors
expect_unauth GET  /api/system/errors/stats
expect_unauth GET  /api/system/breaker
expect_unauth GET  /api/system/alert-dispatches
expect_unauth POST /api/system/test-alert
expect_unauth GET  /api/system/audit
expect_unauth GET  /api/orchestrator/overrides
expect_unauth POST /api/orchestrator/overrides
expect_unauth POST /api/admin/zones/zone-1/override
expect_unauth GET  /api/admin/zones/overrides
expect_unauth GET  /api/admin/alerts/enhanced
expect_unauth GET  /api/admin/providers/behavior
expect_unauth GET  /api/admin/flow/config
expect_unauth GET  /api/admin/governance/actions
expect_unauth GET  /api/admin/strategy/global

# NestJS admin endpoints (proxied)
expect_unauth GET  /api/admin/feature-flags
expect_unauth GET  /api/admin/automation/dashboard
expect_unauth GET  /api/admin/automation/rules

# Wrong-role check: try using a customer JWT on admin endpoint
CUSTOMER_JWT=$(curl -s -X POST "$BASE/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d '{"email":"customer@test.com","password":"Customer123!"}' \
    | jq -r '.accessToken // empty')

if [[ -n "$CUSTOMER_JWT" ]]; then
    code=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "Authorization: Bearer $CUSTOMER_JWT" \
        "$BASE/api/system/errors")
    if [[ "$code" == "401" ]] || [[ "$code" == "403" ]]; then
        green "customer JWT on /api/system/errors → $code (role check)"
        PASS=$((PASS+1))
    else
        red   "customer JWT on /api/system/errors → $code (expected 401/403)"
        FAIL=$((FAIL+1))
    fi
else
    echo "  (no customer user — skipping role test)"
fi

# Valid admin JWT should succeed
ADMIN_JWT=$(curl -s -X POST "$BASE/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d '{"email":"admin@autoservice.com","password":"Admin123!"}' \
    | jq -r '.accessToken // empty')

if [[ -n "$ADMIN_JWT" ]]; then
    code=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "Authorization: Bearer $ADMIN_JWT" \
        "$BASE/api/system/errors?limit=1")
    if [[ "$code" == "200" ]]; then
        green "admin JWT on /api/system/errors → 200"
        PASS=$((PASS+1))
    else
        red   "admin JWT on /api/system/errors → $code (expected 200)"
        FAIL=$((FAIL+1))
    fi
fi

echo ""
if [[ $FAIL -eq 0 ]]; then
    echo -e "\033[1;32m✓ Security audit PASSED — $PASS/$((PASS+FAIL))\033[0m"
    exit 0
else
    echo -e "\033[1;31m✗ Security audit FAILED — $FAIL check(s)\033[0m"
    exit 1
fi
