#!/usr/bin/env bash
# e2e-admin-control.sh — Sprint 9 Admin Control System certification
# Verifies: zone override apply/clear, timeline w/ impact, strategy auto/locked/bounds, enhanced alerts.
set -uo pipefail

BASE_URL="${BACKEND_URL:-http://localhost:8001}/api"
GREEN='\033[1;32m'; RED='\033[1;31m'; CYAN='\033[1;36m'; YELLOW='\033[1;33m'; NC='\033[0m'

PASS=0; FAIL=0
ok()  { echo -e "  ${GREEN}✓${NC} $*"; PASS=$((PASS+1)); }
bad() { echo -e "  ${RED}✗${NC} $*"; FAIL=$((FAIL+1)); }
log() { echo -e "${CYAN}▶${NC} $*"; }
jqp() { python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('$1',''))"; }
jqp2() { python3 -c "import sys,json; d=json.load(sys.stdin); print((d.get('$1') or {}).get('$2',''))"; }

echo "═══════════════════════════════════════════════════════════"
echo "  Sprint 9 — Admin Control System certification"
echo "═══════════════════════════════════════════════════════════"

# Login
TOKEN=$(curl -s -X POST "$BASE_URL/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"admin@autoservice.com","password":"Admin123!"}' | jqp accessToken)
[[ -n "$TOKEN" ]] && ok "Admin login" || { bad "Admin login"; exit 1; }
AUTH=(-H "Authorization: Bearer $TOKEN")

# Get a zone id
ZONE_ID=$(curl -s "$BASE_URL/zones" | python3 -c "import sys,json; d=json.load(sys.stdin); z=d.get('zones') or d; print(z[0]['id'])")
ok "Target zone: $ZONE_ID"

# ═══ BLOCK 1: Zone Override ═══
log "1. Zone Override"

# 1a. Apply override
OVR=$(curl -s -X POST "$BASE_URL/admin/zones/$ZONE_ID/override" "${AUTH[@]}" -H 'Content-Type: application/json' \
  -d '{"mode":"FORCE_SURGE","fanout":6,"priorityOnly":true,"ttlSeconds":120}')
MODE=$(echo "$OVR" | jqp mode)
[[ "$MODE" == "FORCE_SURGE" ]] && ok "Override applied: FORCE_SURGE (fanout=6)" || bad "Override apply failed: $OVR"

# 1b. Zone state reflects override immediately
ZSTATE=$(curl -s "$BASE_URL/zones/$ZONE_ID")
ZMODE=$(echo "$ZSTATE" | jqp overrideMode)
ZSTATUS=$(echo "$ZSTATE" | jqp status)
[[ "$ZMODE" == "FORCE_SURGE" ]] && ok "zones.overrideMode = FORCE_SURGE" || bad "overrideMode missing: $ZMODE"
[[ "$ZSTATUS" == "SURGE" ]] && ok "zones.status forced to SURGE" || bad "status = '$ZSTATUS' (expected SURGE)"

# 1c. Override GET returns active
OVR_GET=$(curl -s "$BASE_URL/admin/zones/$ZONE_ID/override" "${AUTH[@]}")
ACTIVE_MODE=$(echo "$OVR_GET" | jqp mode)
[[ "$ACTIVE_MODE" == "FORCE_SURGE" ]] && ok "GET /override returns active" || bad "GET /override: $OVR_GET"

# 1d. Zone engine respects override after cycle
log "   waiting 12s for zone engine cycle to confirm override persistence..."
sleep 12
ZSTATE2=$(curl -s "$BASE_URL/zones/$ZONE_ID")
ZMODE2=$(echo "$ZSTATE2" | jqp status)
[[ "$ZMODE2" == "SURGE" ]] && ok "After engine cycle: status still SURGE" || bad "engine overrode back: $ZMODE2"

# ═══ BLOCK 2: Timeline ═══
log "2. Orchestrator Timeline"
TL=$(curl -s "$BASE_URL/admin/zones/$ZONE_ID/timeline?hours=1" "${AUTH[@]}")
TL_TOTAL=$(echo "$TL" | jqp total)
[[ "$TL_TOTAL" =~ ^[0-9]+$ ]] && [[ "$TL_TOTAL" -ge 1 ]] && ok "timeline total=$TL_TOTAL" || bad "timeline empty: $TL_TOTAL"

# Check at least one event has ADMIN_OVERRIDE
HAS_ADMIN_OVR=$(echo "$TL" | python3 -c "import sys,json; d=json.load(sys.stdin); print(any(t.get('action')=='ADMIN_OVERRIDE' for t in d.get('timeline',[])))")
[[ "$HAS_ADMIN_OVR" == "True" ]] && ok "timeline contains ADMIN_OVERRIDE event" || bad "ADMIN_OVERRIDE event missing"

# Check impact shape
HAS_IMPACT=$(echo "$TL" | python3 -c "
import sys,json
d=json.load(sys.stdin)
for t in d.get('timeline', []):
  imp = t.get('impact') or {}
  if 'ratioDelta' in imp or 'effectiveness' in imp:
    print('True'); break
else: print('False')
")
[[ "$HAS_IMPACT" == "True" ]] && ok "timeline events carry impact (ratioDelta / effectiveness)" || bad "no impact computed in timeline"

# ═══ BLOCK 3: Strategy Control ═══
log "3. Strategy Control"

# 3a. GET global strategy
STRAT=$(curl -s "$BASE_URL/admin/strategy/global" "${AUTH[@]}")
AUTO_BEFORE=$(echo "$STRAT" | jqp auto)
ok "GET /admin/strategy/global (auto=$AUTO_BEFORE)"

# 3b. Disable auto-learning + set bounds
UPD=$(curl -s -X POST "$BASE_URL/admin/strategy/global" "${AUTH[@]}" -H 'Content-Type: application/json' \
  -d '{"auto":false,"locked":false,"minWeight":0.5,"maxWeight":1.5,"weights":{"SET_SURGE":1.4,"BOOST_SUPPLY":0.9}}')
AUTO_AFTER=$(echo "$UPD" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('strategy',{}).get('auto'))")
W_SURGE=$(echo "$UPD" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('strategy',{}).get('weights',{}).get('SET_SURGE'))")
[[ "$AUTO_AFTER" == "False" ]] && ok "auto-learn disabled (auto=false)" || bad "auto flag failed: $AUTO_AFTER"
[[ "$W_SURGE" == "1.4" ]] && ok "weight SET_SURGE=1.4 within bounds" || bad "weight not saved: $W_SURGE"

# 3c. Clamp test — request a weight outside bounds
CLAMP=$(curl -s -X POST "$BASE_URL/admin/strategy/global" "${AUTH[@]}" -H 'Content-Type: application/json' \
  -d '{"minWeight":0.5,"maxWeight":1.5,"weights":{"SET_SURGE":5.0,"BOOST_SUPPLY":0.1}}')
W_SURGE2=$(echo "$CLAMP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('strategy',{}).get('weights',{}).get('SET_SURGE'))")
W_SUPPLY=$(echo "$CLAMP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('strategy',{}).get('weights',{}).get('BOOST_SUPPLY'))")
[[ "$W_SURGE2" == "1.5" ]] && ok "out-of-bounds weight clamped to max (1.5)" || bad "clamp high failed: $W_SURGE2"
[[ "$W_SUPPLY" == "0.5" ]] && ok "out-of-bounds weight clamped to min (0.5)" || bad "clamp low failed: $W_SUPPLY"

# 3d. Restore auto
curl -s -X POST "$BASE_URL/admin/strategy/global" "${AUTH[@]}" -H 'Content-Type: application/json' \
  -d '{"auto":true,"locked":false,"minWeight":0.3,"maxWeight":2.0}' > /dev/null
ok "strategy restored to auto=true"

# ═══ BLOCK 4: Enhanced Alerts ═══
log "4. Alerts with business impact"
AL=$(curl -s "$BASE_URL/admin/alerts/enhanced" "${AUTH[@]}")
AL_TOTAL=$(echo "$AL" | jqp total)
LOST=$(echo "$AL" | jqp2 summary totalLostRevenuePerHour)
MISSED=$(echo "$AL" | jqp2 summary totalMissedBookings)
CRIT=$(echo "$AL" | jqp2 summary criticalCount)
[[ "$AL_TOTAL" =~ ^[0-9]+$ ]] && ok "alerts/enhanced total=$AL_TOTAL" || bad "alerts total missing"
[[ -n "$LOST" ]] && ok "summary.totalLostRevenuePerHour=$LOST ₴/h" || bad "missing summary.lostRevenue"
[[ -n "$MISSED" ]] && ok "summary.totalMissedBookings=$MISSED" || bad "missing missed"
[[ -n "$CRIT" ]] && ok "summary.criticalCount=$CRIT" || bad "missing crit count"

# Each alert must have recommendedAction + impact
BAD_SHAPE=$(echo "$AL" | python3 -c "
import sys,json
d=json.load(sys.stdin)
bad=0
for a in d.get('alerts',[]):
  if 'recommendedAction' not in a or 'impact' not in a:
    bad+=1
print(bad)
")
[[ "$BAD_SHAPE" == "0" ]] && ok "all alerts carry impact + recommendedAction" || bad "$BAD_SHAPE alerts malformed"

# ═══ BLOCK 5: Override clear ═══
log "5. Clear override"
CLR=$(curl -s -X DELETE "$BASE_URL/admin/zones/$ZONE_ID/override" "${AUTH[@]}")
DEL=$(echo "$CLR" | jqp status)
[[ "$DEL" == "cleared" ]] && ok "override cleared" || bad "clear failed: $CLR"

# Wait for zone engine cycle, status should revert
sleep 12
ZSTATE3=$(curl -s "$BASE_URL/zones/$ZONE_ID")
HAS_OVR=$(echo "$ZSTATE3" | python3 -c "import sys,json; d=json.load(sys.stdin); print('overrideMode' in d and d.get('overrideMode'))")
if [[ "$HAS_OVR" == "False" || -z "$HAS_OVR" ]]; then
  ok "zone no longer overridden after engine cycle"
else
  bad "overrideMode still present: $HAS_OVR"
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
if [[ "$FAIL" -eq 0 ]]; then
  echo -e "${GREEN}✓ ADMIN CONTROL CERTIFIED (PASS=$PASS, FAIL=0)${NC}"
  echo "═══════════════════════════════════════════════════════════"
  exit 0
else
  echo -e "${RED}✗ ADMIN CONTROL CERTIFICATION FAILED ($FAIL errors, $PASS passes)${NC}"
  echo "═══════════════════════════════════════════════════════════"
  exit 1
fi
