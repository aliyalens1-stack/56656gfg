#!/usr/bin/env bash
# smoke-api-contracts.sh — Sprint 5
# Verifies that every critical path from admin/src/shared/api-contracts.ts
# returns 200 (or explicitly expected non-200 like 405).
set -uo pipefail
URL="${BACKEND_URL:-http://localhost:8001}"
RED='\033[1;31m'; GREEN='\033[1;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

CTOK=$(curl -s -X POST "$URL/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"customer@test.com","password":"Customer123!"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)
PTOK=$(curl -s -X POST "$URL/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"provider@test.com","password":"Provider123!"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)
ATOK=$(curl -s -X POST "$URL/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"admin@autoservice.com","password":"Admin123!"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)

FAIL=0
check_get() {
  local section="$1" key="$2" path="$3" token="$4"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$URL/api$path" \
    ${token:+-H "Authorization: Bearer $token"} --max-time 8)
  if [[ "$code" == "200" ]]; then
    printf "  ${GREEN}✓${NC} %-20s %-35s %s\n" "$section" "$key" "$path"
  else
    printf "  ${RED}✗${NC} %-20s %-35s %s  (got %s)\n" "$section" "$key" "$path" "$code"
    FAIL=$((FAIL+1))
  fi
}

echo "🔎 API Contract Catalogue Smoke — Sprint 5"
echo "   Source of truth: admin/src/shared/api-contracts.ts"
echo "   Base URL: $URL"
echo ""

# --- Auth ---
check_get "auth"            "me"                  "/auth/me"                              "$CTOK"
# --- Notifications ---
check_get "notifications"   "my"                  "/notifications/my"                     "$CTOK"
check_get "notifications"   "list"                "/notifications"                        "$CTOK"
check_get "notifications"   "unreadCount"         "/notifications/unread-count"           "$CTOK"
# --- Favorites ---
check_get "favorites"       "my"                  "/favorites/my"                         "$CTOK"
check_get "favorites"       "list"                "/favorites"                            "$CTOK"
# --- Bookings/Quotes/Vehicles/Reviews ---
check_get "bookings"        "my"                  "/bookings/my"                          "$CTOK"
check_get "quotes"          "my"                  "/quotes/my"                            "$CTOK"
check_get "quotes"          "quickTypes"          "/quotes/quick/types"                   "$CTOK"
check_get "vehicles"        "my"                  "/vehicles/my"                          "$CTOK"
check_get "reviews"         "my"                  "/reviews/my"                           "$CTOK"
# --- Organizations/Services ---
check_get "organizations"   "list"                "/organizations"                        ""
check_get "organizations"   "search (search=)"    "/organizations/search?search=moto"     ""
check_get "organizations"   "search (q=)"         "/organizations/search?q=moto"          ""
check_get "services"        "list"                "/services"                             ""
check_get "services"        "categories"          "/services/categories"                  ""
# --- Marketplace ---
check_get "marketplace"     "providers"           "/marketplace/providers"                ""
check_get "marketplace"     "stats"               "/marketplace/stats"                    ""
check_get "matching"        "nearby"              "/matching/nearby?lat=50.45&lng=30.52&limit=3" ""
check_get "experiments"     "active"              "/experiments/active"                   ""
# --- Provider ---
check_get "provider"        "inbox"               "/provider/requests/inbox"              "$PTOK"
check_get "provider"        "currentJob"          "/provider/current-job"                 "$PTOK"
check_get "provider"        "earnings"            "/provider/earnings"                    "$PTOK"
check_get "provider"        "pressureSummary"     "/provider/pressure-summary"            "$PTOK"
check_get "provider"        "billingProducts"     "/provider/billing/products"            "$PTOK"
# --- Zones ---
check_get "zones"           "list"                "/zones"                                ""
check_get "zones"           "liveState"           "/zones/live-state"                     ""
check_get "demand"          "heatmap"             "/demand/heatmap"                       ""
# --- Orchestrator / Feedback ---
check_get "orchestrator"    "state"               "/orchestrator/state"                   "$ATOK"
check_get "feedback"        "dashboard"           "/feedback/dashboard"                   "$ATOK"
check_get "feedback"        "strategy"            "/feedback/strategy"                    "$ATOK"
# --- Admin ---
check_get "admin"           "dashboard"           "/admin/dashboard"                      "$ATOK"
check_get "admin"           "liveFeed"            "/admin/live-feed"                      "$ATOK"
check_get "admin"           "alerts"              "/admin/alerts"                         "$ATOK"
check_get "admin"           "users"               "/admin/users"                          "$ATOK"
check_get "admin"           "bookings"            "/admin/bookings"                       "$ATOK"
check_get "admin"           "featureFlags"        "/admin/config/features"                "$ATOK"
check_get "admin"           "commissionTiers"     "/admin/config/commission-tiers"        "$ATOK"
check_get "admin"           "featureFlagsAlt"     "/admin/feature-flags"                  "$ATOK"
check_get "admin"           "automationReplay"    "/admin/automation/replay"              "$ATOK"
# --- Realtime ---
check_get "realtime"        "status"              "/realtime/status"                      ""
# --- Health ---
check_get "health"          "health"              "/health"                               ""

echo ""
if [[ $FAIL -eq 0 ]]; then
  echo -e "${GREEN}✓ API CONTRACT CATALOGUE HEALTHY — all contract paths 200 OK${NC}"
  exit 0
else
  echo -e "${RED}✗ $FAIL contract path(s) failed${NC}"
  exit 1
fi
