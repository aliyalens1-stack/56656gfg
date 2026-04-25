#!/usr/bin/env bash
# smoke-data-consistency.sh — verifies canonical collections have data + core APIs
set -uo pipefail
DB="${DB_NAME:-auto_platform}"
URL="${BACKEND_URL:-http://localhost:8001}"
RED='\033[1;31m'; GREEN='\033[1;32m'; NC='\033[0m'

FAIL=0

expect_count() {
  local col="$1" op="$2" expected="$3" desc="$4"
  local n
  n=$(mongosh --quiet "$DB" --eval "print(db.$col.countDocuments())" 2>/dev/null || echo "ERR")
  if [[ "$n" == "ERR" ]]; then
    echo -e "  ${RED}✗${NC} $desc ($col): mongosh error"
    FAIL=$((FAIL+1)); return
  fi
  local pass=0
  case "$op" in
    ">")  [[ "$n" -gt "$expected" ]] && pass=1 ;;
    ">=") [[ "$n" -ge "$expected" ]] && pass=1 ;;
    "=")  [[ "$n" -eq "$expected" ]] && pass=1 ;;
  esac
  if [[ "$pass" == "1" ]]; then
    echo -e "  ${GREEN}✓${NC} $desc: $col = $n (expected $op $expected)"
  else
    echo -e "  ${RED}✗${NC} $desc: $col = $n (expected $op $expected)"
    FAIL=$((FAIL+1))
  fi
}

echo "🔎 Data consistency smoke — DB=$DB"
echo ""
echo "→ Canonical collections (must have data):"
expect_count "users"                 ">=" 3    "Seed users (admin/customer/provider)"
expect_count "organizations"         ">=" 5    "Organizations"
expect_count "services"              ">"  5    "Services"
expect_count "servicecategories"     ">"  5    "Service categories"
expect_count "reviews"               ">"  0    "Reviews"
expect_count "zones"                 "="  6    "Zones (canonical)"
expect_count "zone_snapshots"        ">"  100  "Zone snapshots history"
expect_count "provider_availability" ">"  0    "Provider weekly availability (engine)"
expect_count "provider_performance"  ">"  0    "Provider performance aggregates"
expect_count "provider_skills"       ">"  0    "Provider skill categories"
expect_count "provider_locations"    ">"  0    "Provider static locations"
expect_count "bookings"              ">"  10   "Bookings (demo seed)"
expect_count "quotes"                ">"  0    "Quotes (demo seed)"
expect_count "vehicles"              ">"  0    "Vehicles (demo seed)"
expect_count "favorites"             ">"  0    "Favorites (demo seed)"
expect_count "notifications"         ">"  0    "Notifications (demo seed)"
expect_count "payments"              ">"  0    "Payments (mocked demo)"
expect_count "feature_flags"         ">"  0    "Feature flags"
expect_count "audit_logs"            ">"  0    "Audit logs"

echo ""
echo "→ Engine state (running):"
expect_count "orchestrator_logs"     ">"  10   "Orchestrator logs (engine writes)"
expect_count "action_feedback"       ">"  50   "Action feedback (Phase G)"
expect_count "strategy_weights"      ">=" 7    "Strategy weights (Phase H)"
expect_count "governance_actions"    ">"  0    "Governance actions"
expect_count "market_state_snapshots" ">" 100  "Market state snapshots"

echo ""
echo "→ Critical API responses (200 OK):"

check_api() {
  local name="$1" path="$2" token="$3"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$URL$path" \
    ${token:+-H "Authorization: Bearer $token"} --max-time 8)
  if [[ "$code" == "200" ]]; then
    echo -e "  ${GREEN}✓${NC} $name ($code) $path"
  else
    echo -e "  ${RED}✗${NC} $name ($code) $path"
    FAIL=$((FAIL+1))
  fi
}

CTOK=$(curl -s -X POST "$URL/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"customer@test.com","password":"Customer123!"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)
ATOK=$(curl -s -X POST "$URL/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"admin@autoservice.com","password":"Admin123!"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)

check_api "zones live-state"          "/api/zones/live-state"          ""
check_api "marketplace stats"         "/api/marketplace/stats"         ""
check_api "marketplace providers"     "/api/marketplace/providers"     ""
check_api "matching nearby"           "/api/matching/nearby?lat=50.45&lng=30.52&limit=3" ""
check_api "customer bookings"         "/api/bookings/my"               "$CTOK"
check_api "customer vehicles"         "/api/vehicles/my"               "$CTOK"
check_api "customer favorites"        "/api/favorites/my"              "$CTOK"
check_api "customer notifications"    "/api/notifications/my"          "$CTOK"
check_api "admin live-feed"           "/api/admin/live-feed"           "$ATOK"
check_api "admin alerts"              "/api/admin/alerts"              "$ATOK"
check_api "orchestrator state"        "/api/orchestrator/state"        "$ATOK"
check_api "feedback dashboard"        "/api/feedback/dashboard"        "$ATOK"

echo ""
if [[ $FAIL -eq 0 ]]; then
  echo -e "${GREEN}✓ DATA CONSISTENCY OK${NC}"
  exit 0
else
  echo -e "${RED}✗ $FAIL checks failed${NC}"
  exit 1
fi
