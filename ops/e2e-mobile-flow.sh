#!/usr/bin/env bash
# e2e-mobile-flow.sh — Sprint 11 Mobile Intelligence Completion certification
# Verifies: customer home intelligence aggregation + repeat-booking + full lifecycle
# + provider dashboard intelligence endpoints + pressure/opportunities shape.
set -uo pipefail
BASE_URL="${BACKEND_URL:-http://localhost:8001}/api"
GREEN='\033[1;32m'; RED='\033[1;31m'; CYAN='\033[1;36m'; NC='\033[0m'
PASS=0; FAIL=0
ok()  { echo -e "  ${GREEN}✓${NC} $*"; PASS=$((PASS+1)); }
bad() { echo -e "  ${RED}✗${NC} $*"; FAIL=$((FAIL+1)); }
log() { echo -e "${CYAN}▶${NC} $*"; }
jqp() { python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('$1',''))"; }

echo "═══════════════════════════════════════════════════════════"
echo "  Sprint 11 — Mobile Intelligence Completion"
echo "═══════════════════════════════════════════════════════════"

log "1. Login customer + provider + admin"
CUST=$(curl -s -X POST "$BASE_URL/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"customer@test.com","password":"Customer123!"}' | jqp accessToken)
PROV=$(curl -s -X POST "$BASE_URL/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"provider@test.com","password":"Provider123!"}' | jqp accessToken)
ADMIN=$(curl -s -X POST "$BASE_URL/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"admin@autoservice.com","password":"Admin123!"}' | jqp accessToken)
[[ -n "$CUST" && -n "$PROV" && -n "$ADMIN" ]] && ok "all 3 JWTs issued" || { bad "login failed"; exit 1; }
AC=(-H "Authorization: Bearer $CUST"); AP=(-H "Authorization: Bearer $PROV")

log "2. Customer Intelligence Hub — 6 endpoints used by mobile home"
for ep in customer/intelligence customer/recommendations customer/repeat-options customer/favorites customer/garage/recommendations customer/history/summary; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/$ep" "${AC[@]}")
  [[ "$CODE" == "200" ]] && ok "GET /$ep → 200" || bad "GET /$ep → $CODE"
done

log "3. Zones live-state — feeds 'сейчас выгодно' block"
ZL_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/zones/live-state")
[[ "$ZL_CODE" == "200" ]] && ok "/zones/live-state → 200" || bad "live-state → $ZL_CODE"

log "4. End-to-end booking (mobile-parity path)"
ORG_ID=$(curl -s "$BASE_URL/organizations?limit=1" | python3 -c "
import sys,json
d=json.load(sys.stdin); items = d.get('data') or d.get('items') or d
print(items[0].get('_id','') if items else '')
")
QUICK=$(curl -s -X POST "$BASE_URL/quotes/quick" "${AC[@]}" -H 'Content-Type: application/json' \
  -d '{"serviceType":"brakes","lat":50.4501,"lng":30.5234,"urgent":true}')
QUOTE_ID=$(echo "$QUICK" | python3 -c "import sys,json; d=json.load(sys.stdin); q=d.get('quote') or {}; print(q.get('_id') or '')")
[[ -n "$QUOTE_ID" ]] && ok "quick-request created quote $QUOTE_ID" || { bad "quick-request"; exit 1; }
sleep 1

DIST_ID=$(mongosh --quiet auto_search --eval "
  const d = db.requestdistributions.findOne({requestId: ObjectId('$QUOTE_ID')});
  print(d ? d._id.toString() : '');
" 2>/dev/null | tr -d '"\n ')
[[ -n "$DIST_ID" && "$DIST_ID" != "null" ]] && ok "distribution resolved $DIST_ID" || { bad "no distribution"; exit 1; }
ORG_ID=$(mongosh --quiet auto_search --eval "
  const d = db.requestdistributions.findOne({_id: ObjectId('$DIST_ID')});
  print(d ? d.providerId.toString() : '');
" 2>/dev/null | tr -d '"\n ')

ACC=$(curl -s -X POST "$BASE_URL/provider/requests/$DIST_ID/accept?providerId=$ORG_ID" "${AP[@]}")
BOOKING_ID=$(echo "$ACC" | jqp bookingId)
[[ -n "$BOOKING_ID" ]] && ok "provider accepted → booking $BOOKING_ID" || { bad "accept failed"; exit 1; }

# Progression
curl -s -X PATCH "$BASE_URL/bookings/$BOOKING_ID/status" "${AP[@]}" -H 'Content-Type: application/json' -d '{"status":"confirmed"}' > /dev/null
for step in "start_route:on_route" "arrive:arrived" "start_work:in_progress" "complete:completed"; do
  ACT="${step%%:*}"; EXP="${step##*:}"
  RESP=$(curl -s -X POST "$BASE_URL/bookings/$BOOKING_ID/action/$ACT" "${AP[@]}" -d '{}' -H 'Content-Type: application/json')
  NEW=$(echo "$RESP" | jqp newStatus)
  [[ "$NEW" == "$EXP" ]] && ok "action/$ACT → $EXP" || bad "action/$ACT: $NEW"
done

# Active booking visible on mobile home (via /bookings/my)
ACT=$(curl -s "$BASE_URL/bookings/my" "${AC[@]}" | python3 -c "
import sys,json
d=json.load(sys.stdin); items = d if isinstance(d,list) else (d.get('items') or [])
bid='$BOOKING_ID'
print('yes' if any(str(b.get('_id') or '')==bid for b in items) else 'no')
")
[[ "$ACT" == "yes" ]] && ok "booking in /bookings/my (home active card)" || bad "booking not in /bookings/my"

# Review (home stats will reflect)
curl -s -X POST "$BASE_URL/reviews" "${AC[@]}" -H 'Content-Type: application/json' \
  -d "{\"bookingId\":\"$BOOKING_ID\",\"rating\":5,\"comment\":\"mobile sprint 11\"}" > /tmp/rv
REV_ID=$(python3 -c "import json; d=json.load(open('/tmp/rv')); print(d.get('_id') or d.get('id') or '')")
[[ -n "$REV_ID" ]] && ok "review created" || bad "review failed"

log "5. Repeat-booking flow (mobile '1-click repeat')"
REP=$(curl -s "$BASE_URL/customer/repeat-options" "${AC[@]}")
REP_COUNT=$(echo "$REP" | python3 -c "
import sys,json
d=json.load(sys.stdin); o=d.get('options') or d.get('items') or []
print(len(o))
")
[[ "$REP_COUNT" =~ ^[0-9]+$ ]] && ok "repeat-options returns $REP_COUNT items" || bad "repeat-options empty"

log "6. Provider Action Hub — 6 intelligence endpoints"
for ep in provider/intelligence provider/intelligence/earnings provider/intelligence/demand provider/intelligence/performance provider/intelligence/lost-revenue provider/intelligence/opportunities; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/$ep" "${AP[@]}")
  [[ "$CODE" == "200" ]] && ok "GET /$ep → 200" || bad "GET /$ep → $CODE"
done

# Pressure UX fields presence
LOST=$(curl -s "$BASE_URL/provider/intelligence/lost-revenue" "${AP[@]}")
HAS_LOST=$(echo "$LOST" | python3 -c "
import sys,json
d=json.load(sys.stdin)
# Sprint 11 mobile uses d.today.lostRevenue / missed as pressure signals
has = bool(d.get('today')) or any(k in d for k in ('totalLost','amount','lostRevenue','missedBookings','missedJobs'))
print('True' if has else 'False')
")
[[ "$HAS_LOST" == "True" ]] && ok "lost-revenue carries pressure fields" || bad "lost-revenue shape off"

OPPS=$(curl -s "$BASE_URL/provider/intelligence/opportunities" "${AP[@]}")
OPPS_COUNT=$(echo "$OPPS" | python3 -c "
import sys,json
d=json.load(sys.stdin); o=d.get('opportunities') or d.get('items') or []
print(len(o))
")
[[ "$OPPS_COUNT" =~ ^[0-9]+$ ]] && [[ "$OPPS_COUNT" -gt 0 ]] && ok "opportunities list = $OPPS_COUNT items" || bad "opportunities empty"

log "7. Realtime layer"
RT=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/realtime/status")
[[ "$RT" == "200" ]] && ok "realtime/status → 200 (mobile useWebSocket)" || bad "realtime → $RT"

log "8. Mobile bundle served"
WB=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/" --max-time 5 || echo 000)
[[ "$WB" == "200" ]] && ok "expo metro bundle (localhost:3000) → 200" || bad "expo → $WB"

echo ""
echo "═══════════════════════════════════════════════════════════"
if [[ "$FAIL" -eq 0 ]]; then
  echo -e "${GREEN}✓ MOBILE PARITY CERTIFIED (PASS=$PASS, FAIL=0)${NC}"
  echo ""
  echo "Booking $BOOKING_ID · Review $REV_ID · Org $ORG_ID"
  echo "Customer Intelligence Hub: 6/6 endpoints green"
  echo "Provider Action Hub: 6/6 endpoints green"
  echo "═══════════════════════════════════════════════════════════"
  exit 0
else
  echo -e "${RED}✗ MOBILE CERTIFICATION FAILED ($FAIL failures, $PASS passes)${NC}"
  echo "═══════════════════════════════════════════════════════════"
  exit 1
fi
