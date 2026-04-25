#!/usr/bin/env bash
# smoke-contracts.sh — проверка всех contract endpoints (Sprint 1+2)
# Usage: bash /app/ops/smoke-contracts.sh
set -uo pipefail
URL="${BACKEND_URL:-http://localhost:8001}"
RED='\033[1;31m'; GREEN='\033[1;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

login() {
  local email="$1" password="$2"
  curl -s -X POST "$URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"$password\"}" \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null
}

check() {
  local name="$1" method="$2" path="$3" token="${4:-}" expected="${5:-200}"
  local extra=""
  [[ -n "$token" ]] && extra="-H Authorization:Bearer\ $token"
  local code
  if [[ "$method" == "POST" ]]; then
    code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$URL$path" \
      ${token:+-H "Authorization: Bearer $token"} \
      -H "Content-Type: application/json" -d '{}' --max-time 8)
  else
    code=$(curl -s -o /dev/null -w "%{http_code}" "$URL$path" \
      ${token:+-H "Authorization: Bearer $token"} --max-time 8)
  fi
  if [[ "$code" == "$expected" ]]; then
    echo -e "  ${GREEN}✓${NC} $name ($code) ${method} $path"
    return 0
  else
    echo -e "  ${RED}✗${NC} $name (got $code, expected $expected) ${method} $path"
    return 1
  fi
}

echo "🔍 Smoke test — Sprint 1+2 contracts"
echo "   Base: $URL"
echo ""

CTOK=$(login "customer@test.com" "Customer123!")
PTOK=$(login "provider@test.com" "Provider123!")
ATOK=$(login "admin@autoservice.com" "Admin123!")

FAIL=0
[[ -z "$CTOK" ]] && { echo -e "${RED}✗ Customer login failed${NC}"; FAIL=$((FAIL+1)); }
[[ -z "$PTOK" ]] && { echo -e "${RED}✗ Provider login failed${NC}"; FAIL=$((FAIL+1)); }
[[ -z "$ATOK" ]] && { echo -e "${RED}✗ Admin login failed${NC}"; FAIL=$((FAIL+1)); }

echo ""
echo "📱 Customer / Mobile contracts:"
check "notifications alias"    GET "/api/notifications/my"                   "$CTOK" || FAIL=$((FAIL+1))
check "notifications unread"   GET "/api/notifications/unread-count"         "$CTOK" || FAIL=$((FAIL+1))
check "favorites alias"        GET "/api/favorites/my"                       "$CTOK" || FAIL=$((FAIL+1))
check "orgs search q="         GET "/api/organizations/search?q=moto"        "$CTOK" || FAIL=$((FAIL+1))
check "orgs search search="    GET "/api/organizations/search?search=moto"   "$CTOK" || FAIL=$((FAIL+1))
check "payments list alias"    GET "/api/payments/list"                      "$CTOK" || FAIL=$((FAIL+1))
check "bookings my"            GET "/api/bookings/my"                        "$CTOK" || FAIL=$((FAIL+1))
check "quotes my"              GET "/api/quotes/my"                          "$CTOK" || FAIL=$((FAIL+1))
check "vehicles my"            GET "/api/vehicles/my"                        "$CTOK" || FAIL=$((FAIL+1))
check "reviews my"             GET "/api/reviews/my"                         "$CTOK" || FAIL=$((FAIL+1))

echo ""
echo "🔐 Auth contracts:"
# forgot-password требует email → шлём валидный body отдельно
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$URL/api/auth/forgot-password" \
  -H "Content-Type: application/json" -d '{"email":"customer@test.com"}' --max-time 8)
if [[ "$CODE" == "200" ]]; then
  echo -e "  ${GREEN}✓${NC} auth forgot-password (200) POST /api/auth/forgot-password"
else
  echo -e "  ${RED}✗${NC} auth forgot-password ($CODE, expected 200) POST /api/auth/forgot-password"
  FAIL=$((FAIL+1))
fi
check "auth me"                GET  "/api/auth/me"                           "$CTOK" || FAIL=$((FAIL+1))

echo ""
echo "🛠 Admin contracts:"
check "admin dashboard"        GET "/api/admin/dashboard"                    "$ATOK" || FAIL=$((FAIL+1))
check "admin live-feed"        GET "/api/admin/live-feed"                    "$ATOK" || FAIL=$((FAIL+1))
check "admin alerts"           GET "/api/admin/alerts"                       "$ATOK" || FAIL=$((FAIL+1))
check "admin replay alias"     GET "/api/admin/automation/replay"            "$ATOK" || FAIL=$((FAIL+1))
check "admin config/features"  GET "/api/admin/config/features"              "$ATOK" || FAIL=$((FAIL+1))
check "admin commission-tiers" GET "/api/admin/config/commission-tiers"      "$ATOK" || FAIL=$((FAIL+1))
check "admin users"            GET "/api/admin/users"                        "$ATOK" || FAIL=$((FAIL+1))
check "admin bookings"         GET "/api/admin/bookings"                     "$ATOK" || FAIL=$((FAIL+1))

echo ""
echo "🔧 Provider contracts:"
check "provider earnings"      GET "/api/provider/earnings"                  "$PTOK" || FAIL=$((FAIL+1))
check "provider current-job"   GET "/api/provider/current-job"               "$PTOK" || FAIL=$((FAIL+1))
check "provider inbox"         GET "/api/provider/requests/inbox"            "$PTOK" || FAIL=$((FAIL+1))
check "provider pressure"      GET "/api/provider/pressure-summary"          "$PTOK" || FAIL=$((FAIL+1))

echo ""
echo "⚙  Engines:"
check "orchestrator state"     GET "/api/orchestrator/state"                 "$ATOK" || FAIL=$((FAIL+1))
check "feedback dashboard"     GET "/api/feedback/dashboard"                 "$ATOK" || FAIL=$((FAIL+1))
check "feedback strategy"      GET "/api/feedback/strategy"                  "$ATOK" || FAIL=$((FAIL+1))
check "zones"                  GET "/api/zones"                              ""      || FAIL=$((FAIL+1))
check "zones live-state"       GET "/api/zones/live-state"                   ""      || FAIL=$((FAIL+1))
check "marketplace stats"      GET "/api/marketplace/stats"                  ""      || FAIL=$((FAIL+1))

echo ""
if [[ "$FAIL" -eq 0 ]]; then
  echo -e "${GREEN}✓ ALL CONTRACTS HEALTHY${NC}"
  exit 0
else
  echo -e "${RED}✗ $FAIL contract(s) failed${NC}"
  exit 1
fi
