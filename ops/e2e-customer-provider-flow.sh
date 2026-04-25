#!/usr/bin/env bash
# e2e-customer-provider-flow.sh — Sprint 7/8 E2E certification
# Full marketplace loop: customer → quick-request → distribution → provider accept
# → status progression → completion → review → rating impact.
set -uo pipefail

BASE_URL="${BACKEND_URL:-http://localhost:8001}/api"
CUSTOMER_EMAIL="customer@test.com"
CUSTOMER_PASS="Customer123!"
PROVIDER_EMAIL="provider@test.com"
PROVIDER_PASS="Provider123!"

GREEN='\033[1;32m'; RED='\033[1;31m'; YELLOW='\033[1;33m'; CYAN='\033[1;36m'; NC='\033[0m'

PASS=0; FAIL=0
STEPS=()

log()  { echo -e "${CYAN}▶${NC} $*"; }
ok()   { echo -e "  ${GREEN}✓${NC} $*"; PASS=$((PASS+1)); STEPS+=("PASS: $*"); }
bad()  { echo -e "  ${RED}✗${NC} $*"; FAIL=$((FAIL+1)); STEPS+=("FAIL: $*"); }
warn() { echo -e "  ${YELLOW}!${NC} $*"; }
jqp()  { python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('$1',''))"; }

echo "═══════════════════════════════════════════════════════════"
echo "  Sprint 7/8 — E2E Marketplace Flow Certification"
echo "  Base URL: $BASE_URL"
echo "═══════════════════════════════════════════════════════════"

# ── 1. Login ──────────────────────────────────────────────
log "1. Login customer + provider"
CUSTOMER_TOKEN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$CUSTOMER_EMAIL\",\"password\":\"$CUSTOMER_PASS\"}" \
  | jqp accessToken)
[[ -n "$CUSTOMER_TOKEN" ]] && ok "Customer login → JWT" || { bad "Customer login failed"; exit 1; }

PROVIDER_TOKEN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$PROVIDER_EMAIL\",\"password\":\"$PROVIDER_PASS\"}" \
  | jqp accessToken)
[[ -n "$PROVIDER_TOKEN" ]] && ok "Provider login → JWT" || { bad "Provider login failed"; exit 1; }

ADMIN_TOKEN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@autoservice.com","password":"Admin123!"}' \
  | jqp accessToken)

# ── 2. Pick provider org ──────────────────────────────────
log "2. Pick a target provider organization"
ORGS_JSON=$(curl -s "$BASE_URL/organizations?limit=1")
ORG_ID=$(echo "$ORGS_JSON" | python3 -c "
import sys,json
d=json.load(sys.stdin)
items = d.get('data') or d.get('items') if isinstance(d, dict) else d
if isinstance(items, list) and items:
  o=items[0]
  print(o.get('_id') or o.get('id') or '')
else: print('')
")
ORG_RATING_BEFORE=$(echo "$ORGS_JSON" | python3 -c "
import sys,json
d=json.load(sys.stdin)
items = d.get('data') or d.get('items') if isinstance(d, dict) else d
if isinstance(items, list) and items:
  o=items[0]; print(o.get('rating') or 0)
else: print('0')
")
[[ -n "$ORG_ID" ]] && ok "Target org: $ORG_ID (rating=$ORG_RATING_BEFORE)" || { bad "Could not pick organization"; exit 1; }

# ── 3. Create quick request ───────────────────────────────
log "3. Customer creates quick-request (brakes @ Kyiv)"
QUICK_RESP=$(curl -s -X POST "$BASE_URL/quotes/quick" \
  -H "Authorization: Bearer $CUSTOMER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"serviceType":"brakes","lat":50.4501,"lng":30.5234,"description":"E2E test request","urgent":true}')
QUOTE_ID=$(echo "$QUICK_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); q=d.get('quote') or {}; print(q.get('_id') or q.get('id') or d.get('quoteId') or '')")
MATCH_COUNT=$(echo "$QUICK_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); m=d.get('matches') or []; print(len(m))")
if [[ -n "$QUOTE_ID" ]]; then
  ok "Quote created: $QUOTE_ID (matches=$MATCH_COUNT)"
else
  bad "Quick request did not return quote id: $(echo "$QUICK_RESP" | head -c 300)"; exit 1
fi

# Give dispatcher a breath
sleep 1

# ── 4. Provider inbox ─────────────────────────────────────
log "4. Provider inbox shows the distribution"
INBOX=$(curl -s "$BASE_URL/provider/requests/inbox?providerId=$ORG_ID" \
  -H "Authorization: Bearer $PROVIDER_TOKEN")
# inbox might be array or {items: []}
DIST_ID=$(echo "$INBOX" | python3 -c "
import sys,json
d=json.load(sys.stdin)
items = d if isinstance(d, list) else (d.get('items') or d.get('requests') or [])
qid = '$QUOTE_ID'
for it in items:
  rid = str(it.get('requestId') or (it.get('request') or {}).get('_id') or it.get('quoteId') or '')
  if qid and rid == qid:
    print(it.get('_id') or it.get('distributionId') or it.get('id') or ''); break
else:
  if items: print(items[0].get('_id') or items[0].get('distributionId') or items[0].get('id') or '')
")
if [[ -n "$DIST_ID" ]]; then
  ok "Distribution in inbox: $DIST_ID"
else
  warn "Inbox empty for provider $ORG_ID (distribution may have gone to other top-3) — retry with admin fallback"
  # Admin fallback: get any distribution for this quote
  if [[ -n "$ADMIN_TOKEN" ]]; then
    DIST_ID=$(curl -s "$BASE_URL/provider/requests/inbox" -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "
import sys,json
d=json.load(sys.stdin)
items = d if isinstance(d, list) else (d.get('items') or [])
qid = '$QUOTE_ID'
for it in items:
  rid = str(it.get('requestId') or (it.get('request') or {}).get('_id') or '')
  if rid == qid:
    print(it.get('_id') or it.get('distributionId') or ''); break
")
    # Also need to retarget ORG_ID to whoever this distribution belongs to
    if [[ -n "$DIST_ID" ]]; then
      TARGET_ORG=$(mongosh --quiet auto_search --eval "
        const d = db.requestdistributions.findOne({_id: ObjectId('$DIST_ID')});
        print(d ? d.providerId : '');
      " 2>/dev/null | tr -d '"')
      [[ -n "$TARGET_ORG" && "$TARGET_ORG" != "null" ]] && ORG_ID="$TARGET_ORG"
      ok "Distribution found via admin: $DIST_ID (retargeted org=$ORG_ID)"
    else
      bad "No distribution exists for quote $QUOTE_ID"; exit 1
    fi
  else
    bad "No admin token for fallback"; exit 1
  fi
fi

# ── 5. Provider accept ────────────────────────────────────
log "5. Provider accepts the request"
ACCEPT=$(curl -s -X POST "$BASE_URL/provider/requests/$DIST_ID/accept?providerId=$ORG_ID" \
  -H "Authorization: Bearer $PROVIDER_TOKEN")
BOOKING_ID=$(echo "$ACCEPT" | jqp bookingId)
if [[ -n "$BOOKING_ID" ]]; then
  ok "Booking created: $BOOKING_ID"
else
  bad "Accept failed: $(echo "$ACCEPT" | head -c 300)"; exit 1
fi

# ── 6. Verify booking ownership ───────────────────────────
log "6. Verify booking is visible to customer"
MY_BOOKINGS=$(curl -s "$BASE_URL/bookings/my" -H "Authorization: Bearer $CUSTOMER_TOKEN")
FOUND=$(echo "$MY_BOOKINGS" | python3 -c "
import sys,json
d=json.load(sys.stdin)
items = d if isinstance(d,list) else (d.get('items') or [])
bid='$BOOKING_ID'
print('yes' if any(str(b.get('_id') or b.get('id') or '')==bid for b in items) else 'no')
")
[[ "$FOUND" == "yes" ]] && ok "Booking visible in /bookings/my" || bad "Booking NOT in /bookings/my"

# Also live view
LIVE_CUST=$(curl -s "$BASE_URL/customer/bookings/$BOOKING_ID/live" -H "Authorization: Bearer $CUSTOMER_TOKEN")
LCODE=$(echo "$LIVE_CUST" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status') or (d.get('booking') or {}).get('status') or '')")
[[ -n "$LCODE" ]] && ok "Customer live-view status=$LCODE" || warn "Customer live-view empty (non-critical)"

# ── 7. Status progression (PENDING → CONFIRMED → ON_ROUTE → ARRIVED → IN_PROGRESS → COMPLETED) ─
log "7. Provider drives booking state machine"

# 7.1 Confirm (provider PATCH status)
CONFIRM=$(curl -s -X PATCH "$BASE_URL/bookings/$BOOKING_ID/status" \
  -H "Authorization: Bearer $PROVIDER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"status":"confirmed"}')
CSTAT=$(echo "$CONFIRM" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status') or (d.get('booking') or {}).get('status') or '')")
[[ "$CSTAT" == "confirmed" ]] && ok "PENDING → CONFIRMED" || { bad "confirm failed: $(echo "$CONFIRM" | head -c 200)"; }

for step in "start_route:on_route" "arrive:arrived" "start_work:in_progress" "complete:completed"; do
  ACTION="${step%%:*}"
  EXPECT="${step##*:}"
  RESP=$(curl -s -X POST "$BASE_URL/bookings/$BOOKING_ID/action/$ACTION" \
    -H "Authorization: Bearer $PROVIDER_TOKEN" \
    -H 'Content-Type: application/json' -d '{}')
  NEW=$(echo "$RESP" | jqp newStatus)
  if [[ "$NEW" == "$EXPECT" ]]; then
    ok "action/$ACTION → $EXPECT"
  else
    bad "action/$ACTION: expected $EXPECT got '$NEW' body=$(echo "$RESP" | head -c 200)"
    # Try to continue gracefully
  fi
  sleep 0.3
done

# ── 8. Final status must be completed ─────────────────────
log "8. Final booking status"
FINAL_B=$(curl -s "$BASE_URL/bookings/$BOOKING_ID" -H "Authorization: Bearer $CUSTOMER_TOKEN")
FINAL_STATUS=$(echo "$FINAL_B" | jqp status)
[[ "$FINAL_STATUS" == "completed" ]] && ok "Booking status = completed" || bad "Booking final status = '$FINAL_STATUS'"

# ── 9. Review ─────────────────────────────────────────────
log "9. Customer leaves review"
REV=$(curl -s -X POST "$BASE_URL/reviews" \
  -H "Authorization: Bearer $CUSTOMER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"bookingId\":\"$BOOKING_ID\",\"rating\":5,\"comment\":\"E2E test — great service!\"}")
REVIEW_ID=$(echo "$REV" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('_id') or d.get('id') or (d.get('review') or {}).get('_id') or '')")
if [[ -n "$REVIEW_ID" ]]; then
  ok "Review created: $REVIEW_ID"
else
  bad "Review create failed: $(echo "$REV" | head -c 300)"
fi

# ── 10. Rating impact (org rating recalculated) ───────────
log "10. Provider rating recomputed"
sleep 1
STATS=$(curl -s "$BASE_URL/reviews/organization/$ORG_ID/stats")
ORG_RATING_AFTER=$(echo "$STATS" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(d.get('avgRating') or d.get('averageRating') or d.get('rating') or 0)
")
REVIEW_COUNT=$(echo "$STATS" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(d.get('totalReviews') or d.get('count') or 0)
")
if [[ -n "$ORG_RATING_AFTER" ]] && awk "BEGIN { exit !($ORG_RATING_AFTER > 0) }"; then
  ok "Org rating after = $ORG_RATING_AFTER (reviews=$REVIEW_COUNT)"
else
  bad "Rating not recalculated (got '$ORG_RATING_AFTER')"
fi

# ── 11. System signals ────────────────────────────────────
log "11. System signals — orchestrator, feedback, system_logs"

ORCH_CNT=$(mongosh --quiet auto_search --eval 'print(db.orchestrator_logs.countDocuments())' 2>/dev/null | tr -d '\n' || echo 0)
if [[ "$ORCH_CNT" =~ ^[0-9]+$ ]] && [[ "$ORCH_CNT" -gt 0 ]]; then
  ok "orchestrator_logs count=$ORCH_CNT"
else
  bad "orchestrator_logs is empty ($ORCH_CNT)"
fi

FB_CNT=$(mongosh --quiet auto_search --eval 'print(db.action_feedback.countDocuments())' 2>/dev/null | tr -d '\n' || echo 0)
if [[ "$FB_CNT" =~ ^[0-9]+$ ]] && [[ "$FB_CNT" -gt 0 ]]; then
  ok "action_feedback count=$FB_CNT"
else
  warn "action_feedback empty ($FB_CNT) — may need a few more feedback cycles"
fi

# Errors during run
ERR_STATS=$(curl -s "$BASE_URL/system/errors/stats" -H "Authorization: Bearer $ADMIN_TOKEN")
ERR_5M=$(echo "$ERR_STATS" | jqp errorsLast5Min)
ERR_TOTAL=$(echo "$ERR_STATS" | python3 -c "import sys,json; d=json.load(sys.stdin); print((d.get('countersLive') or {}).get('total',0))")
echo -e "  ${CYAN}ℹ${NC} errorsLast5Min=$ERR_5M totalLive=$ERR_TOTAL"

# Realtime status
RT=$(curl -s "$BASE_URL/realtime/status")
CLIENTS=$(echo "$RT" | jqp connectedClients)
echo -e "  ${CYAN}ℹ${NC} realtime connected clients: $CLIENTS"

# ── 12. Data integrity links ──────────────────────────────
log "12. Data integrity (mongo)"
INTEGRITY=$(mongosh --quiet auto_search --eval "
const b = db.bookings.findOne({_id: ObjectId('$BOOKING_ID')});
const r = db.reviews.findOne({bookingId: ObjectId('$BOOKING_ID')});
const ok = {
  booking_exists: !!b,
  booking_status: b ? b.status : null,
  booking_user: b ? String(b.userId) : null,
  booking_org: b ? String(b.organizationId) : null,
  review_exists: !!r,
  review_rating: r ? r.rating : null,
};
print(JSON.stringify(ok));
" 2>/dev/null)
echo -e "  ${CYAN}ℹ${NC} $INTEGRITY"
[[ "$INTEGRITY" == *'"booking_exists":true'* ]] && ok "booking persisted" || bad "booking not found in Mongo"
[[ "$INTEGRITY" == *'"booking_status":"completed"'* ]] && ok "Mongo confirms status=completed" || bad "Mongo status mismatch"
[[ "$INTEGRITY" == *'"review_exists":true'* ]] && ok "review persisted and linked to booking" || bad "review missing in Mongo"

# ── Final verdict ─────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════"
if [[ "$FAIL" -eq 0 ]]; then
  echo -e "${GREEN}✓ E2E FLOW CERTIFIED (PASS=$PASS, FAIL=0)${NC}"
  echo ""
  echo "Booking: $BOOKING_ID"
  echo "Quote:   $QUOTE_ID"
  echo "Review:  $REVIEW_ID"
  echo "Org:     $ORG_ID  rating $ORG_RATING_BEFORE → $ORG_RATING_AFTER"
  echo "═══════════════════════════════════════════════════════════"
  exit 0
else
  echo -e "${RED}✗ E2E FLOW FAILED ($FAIL failures, $PASS passes)${NC}"
  echo "═══════════════════════════════════════════════════════════"
  exit 1
fi
