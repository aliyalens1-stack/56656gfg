#!/usr/bin/env bash
# health.sh — проверка всех URL и фоновых движков
set -uo pipefail
URL="${EXPO_PUBLIC_BACKEND_URL:-http://localhost:8001}"
RED='\033[1;31m'; GREEN='\033[1;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

check() {
  local name="$1" url="$2" expected="$3"
  local code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url" || echo "000")
  if [[ "$code" == "$expected" ]]; then
    echo -e "  ${GREEN}✓${NC} $name ($code)"
    return 0
  else
    echo -e "  ${RED}✗${NC} $name (got $code, expected $expected)"
    return 1
  fi
}

echo "🔍 Health check"
echo "   Base URL: $URL"
echo ""

FAIL=0
check "FastAPI /api/health"           "$URL/api/health"                        200 || FAIL=$((FAIL+1))
check "Mobile Expo (root)"            "$URL/"                                   200 || FAIL=$((FAIL+1))
check "Admin Panel"                   "$URL/api/admin-panel/"                   200 || FAIL=$((FAIL+1))
check "Web Marketplace"               "$URL/api/web-app/"                       200 || FAIL=$((FAIL+1))
check "NestJS (organizations proxy)"  "$URL/api/organizations"                  200 || FAIL=$((FAIL+1))
check "Marketplace stats"             "$URL/api/marketplace/stats"              200 || FAIL=$((FAIL+1))
check "Zones (Phase D)"               "$URL/api/zones"                          200 || FAIL=$((FAIL+1))

# Auth protected endpoints (admin login → token → Phase E/G/H check)
TOKEN=$(curl -s -X POST "$URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@autoservice.com","password":"Admin123!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null || echo "")

if [[ -n "$TOKEN" ]]; then
  echo -e "  ${GREEN}✓${NC} Admin login (JWT obtained)"
  for path in "/api/orchestrator/state" "/api/feedback/dashboard" "/api/feedback/strategy"; do
    code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$URL$path")
    if [[ "$code" == "200" ]]; then echo -e "  ${GREEN}✓${NC} $path"; else echo -e "  ${RED}✗${NC} $path ($code)"; FAIL=$((FAIL+1)); fi
  done
else
  echo -e "  ${RED}✗${NC} Admin login failed"
  FAIL=$((FAIL+1))
fi

echo ""
echo "🔧 Supervisor status:"
sudo supervisorctl status | awk '{printf "   %-20s %s\n", $1, $2}'

echo ""
echo "⚙  Background engines (последние строки логов):"
grep -oE "Orchestrator cycle #[0-9]+" /var/log/supervisor/backend.err.log 2>/dev/null | tail -1 | sed 's/^/   /' || true
grep -oE "Feedback processor: completed [0-9]+ feedback records" /var/log/supervisor/backend.err.log 2>/dev/null | tail -1 | sed 's/^/   /' || true

echo ""
echo "🔎 Sprint 3+4+5 — Data consistency, contracts, realtime, API catalogue:"
SD=$(dirname "$0")
bash "$SD/smoke-contracts.sh"          > /dev/null 2>&1 && echo -e "  ${GREEN}✓${NC} smoke-contracts.sh"          || { echo -e "  ${RED}✗${NC} smoke-contracts.sh failed (run it manually)"; FAIL=$((FAIL+1)); }
bash "$SD/smoke-data-consistency.sh"   > /dev/null 2>&1 && echo -e "  ${GREEN}✓${NC} smoke-data-consistency.sh"   || { echo -e "  ${RED}✗${NC} smoke-data-consistency.sh failed (run it manually)"; FAIL=$((FAIL+1)); }
bash "$SD/check-deprecated-collections.sh" > /dev/null 2>&1 && echo -e "  ${GREEN}✓${NC} check-deprecated-collections.sh" || { echo -e "  ${RED}✗${NC} deprecated collections detected (run it manually)"; FAIL=$((FAIL+1)); }
bash "$SD/smoke-realtime.sh"           > /dev/null 2>&1 && echo -e "  ${GREEN}✓${NC} smoke-realtime.sh"           || { echo -e "  ${RED}✗${NC} smoke-realtime.sh failed (run it manually)"; FAIL=$((FAIL+1)); }
bash "$SD/smoke-api-contracts.sh"      > /dev/null 2>&1 && echo -e "  ${GREEN}✓${NC} smoke-api-contracts.sh"      || { echo -e "  ${RED}✗${NC} smoke-api-contracts.sh failed (run it manually)"; FAIL=$((FAIL+1)); }
bash "$SD/smoke-errors.sh"             > /dev/null 2>&1 && echo -e "  ${GREEN}✓${NC} smoke-errors.sh"             || { echo -e "  ${RED}✗${NC} smoke-errors.sh failed (run it manually)"; FAIL=$((FAIL+1)); }

echo ""
if [[ "$FAIL" -eq 0 ]]; then
  echo -e "${GREEN}✓ ALL HEALTHY${NC}"
  exit 0
else
  echo -e "${RED}✗ $FAIL checks failed${NC}"
  exit 1
fi
