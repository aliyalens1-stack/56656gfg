#!/usr/bin/env bash
# smoke-realtime.sh — verifies socket.io layer end-to-end.
#
# What it checks (Sprint 4 DoD):
#   1. /api/realtime/status reports OK
#   2. /api/socket.io/ handshake returns 200 (polling works through /api proxy)
#   3. JS client connects via socket.io-client → receives custom event within 3s
#   4. Backend emit endpoint POST /api/realtime/emit succeeds
set -uo pipefail
URL="${BACKEND_URL:-http://localhost:8001}"
RED='\033[1;31m'; GREEN='\033[1;32m'; NC='\033[0m'

FAIL=0

echo "🔎 Realtime smoke — $URL"
echo ""

# 1) /api/realtime/status
code=$(curl -s -o /tmp/rts.json -w "%{http_code}" "$URL/api/realtime/status" --max-time 5)
if [[ "$code" == "200" ]]; then
  echo -e "  ${GREEN}✓${NC} /api/realtime/status (200)"
else
  echo -e "  ${RED}✗${NC} /api/realtime/status ($code)"
  FAIL=$((FAIL+1))
fi

# 2) socket.io handshake via proxy
HS=$(curl -s "$URL/api/socket.io/realtime/?EIO=4&transport=polling" --max-time 5)
if echo "$HS" | grep -q '"sid"'; then
  echo -e "  ${GREEN}✓${NC} /api/socket.io/ handshake returns sid"
else
  echo -e "  ${RED}✗${NC} /api/socket.io/ handshake failed: ${HS:0:100}"
  FAIL=$((FAIL+1))
fi

# 3) End-to-end: JS client connects + receives event
cat > /tmp/smoke-realtime.js <<'EOF'
const { io } = require('/app/admin/node_modules/socket.io-client');

const URL = process.env.URL || 'http://localhost:8001';
const socket = io(`${URL}/realtime`, {
  path: '/api/socket.io/',
  transports: ['polling'],
  upgrade: false,
  reconnection: false,
  timeout: 5000,
});

const received = new Set();
socket.on('connect', async () => {
  // trigger a test event from backend
  try {
    await fetch(`${URL}/api/realtime/emit?event_type=zone:updated`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: true, ts: Date.now(), zoneId: 'smoke-zone' }),
    });
  } catch (e) {}
  try {
    await fetch(`${URL}/api/realtime/emit?event_type=orchestrator:zone_action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: true, zoneId: 'smoke-zone', action: 'surge_up' }),
    });
  } catch (e) {}
});

socket.on('zone:updated', () => received.add('zone:updated'));
socket.on('orchestrator:zone_action', () => received.add('orchestrator:zone_action'));

setTimeout(() => {
  const got = [...received];
  if (got.length >= 1) {
    console.log(`OK received=${got.join(',')}`);
    process.exit(0);
  } else {
    console.error('FAIL no events received in 4s');
    process.exit(1);
  }
}, 4000);
EOF

URL="$URL" node /tmp/smoke-realtime.js 2>&1 | tee /tmp/smoke-realtime.log
if grep -q "^OK" /tmp/smoke-realtime.log; then
  echo -e "  ${GREEN}✓${NC} socket.io client received realtime event"
else
  echo -e "  ${RED}✗${NC} socket.io client did NOT receive event within 4s"
  FAIL=$((FAIL+1))
fi

echo ""
if [[ $FAIL -eq 0 ]]; then
  echo -e "${GREEN}✓ REALTIME OK${NC}"
  exit 0
else
  echo -e "${RED}✗ $FAIL checks failed${NC}"
  exit 1
fi
