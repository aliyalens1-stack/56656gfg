#!/usr/bin/env bash
# smoke-errors.sh — Sprint 6 unified error envelope verification
# Проверяет что FastAPI и NestJS отвечают единым форматом ошибок.
set -uo pipefail
URL="${BACKEND_URL:-http://localhost:8001}"
GREEN='\033[1;32m'; RED='\033[1;31m'; YELLOW='\033[1;33m'; NC='\033[0m'

FAIL=0
PASS=0

check_envelope() {
  local name="$1" method="$2" path="$3" expected_status="$4" expected_code="$5"
  local extra_args="${6:-}"
  local body
  local status
  local resp
  resp=$(eval curl -s -o /tmp/err_body.json -w "'%{http_code}'" -X "$method" "$extra_args" "\"$URL$path\"" 2>/dev/null)
  status=$(echo "$resp" | tr -d "'")
  body=$(cat /tmp/err_body.json 2>/dev/null || echo "{}")
  local error code msg
  error=$(echo "$body" | python3 -c "import sys,json; d=json.load(sys.stdin) if sys.stdin.read else {}; sys.stdin.seek(0); print(d.get('error',''))" 2>/dev/null || echo "")
  # Re-parse more robustly
  local parsed
  parsed=$(python3 -c "
import json, sys
try:
  with open('/tmp/err_body.json') as f:
    d = json.load(f)
  print(json.dumps({'error': d.get('error'), 'code': d.get('code'), 'message': d.get('message')}))
except Exception as e:
  print('{}')
")
  error=$(echo "$parsed" | python3 -c "import sys,json; print(json.load(sys.stdin).get('error'))")
  code=$(echo "$parsed" | python3 -c "import sys,json; print(json.load(sys.stdin).get('code') or '')")
  msg=$(echo "$parsed" | python3 -c "import sys,json; print(json.load(sys.stdin).get('message') or '')")

  local ok=1
  [[ "$status" == "$expected_status" ]] || ok=0
  [[ "$error" == "True" ]] || ok=0
  if [[ -n "$expected_code" && "$code" != "$expected_code" ]]; then ok=0; fi
  [[ -n "$msg" ]] || ok=0

  if [[ "$ok" == "1" ]]; then
    echo -e "  ${GREEN}✓${NC} $name → $status $code"
    PASS=$((PASS+1))
  else
    echo -e "  ${RED}✗${NC} $name: status=$status error=$error code=$code msg='$msg' (expected $expected_status/$expected_code)"
    FAIL=$((FAIL+1))
  fi
}

echo "🧪 Sprint 6 — unified error envelope smoke"
echo "   Base URL: $URL"
echo ""
echo "→ FastAPI-layer errors"
check_envelope "404 unknown FastAPI route"  GET  "/api/__definitely_not_exist__" 404 ""
check_envelope "401 protected w/o token"    GET  "/api/system/errors"            401 "UNAUTHORIZED"
check_envelope "401 bad JWT"                GET  "/api/system/errors"            401 "UNAUTHORIZED" "-H 'Authorization: Bearer bad.token.value'"
check_envelope "400 login no body"          POST "/api/auth/login"               400 "VALIDATION_ERROR" "-H 'Content-Type: application/json' -d '{}'"
check_envelope "401 login wrong creds"      POST "/api/auth/login"               401 "UNAUTHORIZED" "-H 'Content-Type: application/json' -d '{\"email\":\"x@x.x\",\"password\":\"bad\"}'"

echo ""
echo "→ NestJS-layer errors (through FastAPI catch-all proxy)"
check_envelope "404 unknown nest resource"  GET  "/api/zones/__nope__"           404 "NOT_FOUND"
check_envelope "401 nest protected"         GET  "/api/admin/users"              401 ""

echo ""
echo "→ Observability endpoints"
HEALTH_CODE=$(curl -s -o /tmp/health.json -w "%{http_code}" "$URL/api/system/health")
if [[ "$HEALTH_CODE" == "200" ]]; then
  has=$(python3 -c "import json; d=json.load(open('/tmp/health.json')); print('ok' if all(k in d for k in ('status','requestsTotal','errorsLast5Min','counters','orchestratorAlive')) else 'miss')")
  if [[ "$has" == "ok" ]]; then echo -e "  ${GREEN}✓${NC} /api/system/health → 200 (schema ok)"; PASS=$((PASS+1)); else echo -e "  ${RED}✗${NC} /api/system/health schema incomplete"; FAIL=$((FAIL+1)); fi
else
  echo -e "  ${RED}✗${NC} /api/system/health → $HEALTH_CODE"
  FAIL=$((FAIL+1))
fi

# Need JWT for /system/errors/stats
TOKEN=$(curl -s -X POST "$URL/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"admin@autoservice.com","password":"Admin123!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null || echo "")
if [[ -n "$TOKEN" ]]; then
  STATS_CODE=$(curl -s -o /tmp/stats.json -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$URL/api/system/errors/stats")
  if [[ "$STATS_CODE" == "200" ]]; then
    has=$(python3 -c "import json; d=json.load(open('/tmp/stats.json')); print('ok' if all(k in d for k in ('errorsLast5Min','errorRate','timeline','topCodes','topRoutes','countersLive')) else 'miss')")
    if [[ "$has" == "ok" ]]; then echo -e "  ${GREEN}✓${NC} /api/system/errors/stats → 200 (schema ok)"; PASS=$((PASS+1)); else echo -e "  ${RED}✗${NC} /api/system/errors/stats schema incomplete"; FAIL=$((FAIL+1)); fi
  else
    echo -e "  ${RED}✗${NC} /api/system/errors/stats → $STATS_CODE"
    FAIL=$((FAIL+1))
  fi
  ERRORS_CODE=$(curl -s -o /tmp/errors.json -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$URL/api/system/errors?limit=10")
  if [[ "$ERRORS_CODE" == "200" ]]; then
    echo -e "  ${GREEN}✓${NC} /api/system/errors → 200"
    PASS=$((PASS+1))
  else
    echo -e "  ${RED}✗${NC} /api/system/errors → $ERRORS_CODE"
    FAIL=$((FAIL+1))
  fi
else
  echo -e "  ${YELLOW}!${NC} could not obtain admin JWT — skipping authed checks"
fi

echo ""
if [[ "$FAIL" -eq 0 ]]; then
  echo -e "${GREEN}✓ ALL ERROR CONTRACTS OK ($PASS checks)${NC}"
  exit 0
else
  echo -e "${RED}✗ $FAIL checks failed (PASS=$PASS)${NC}"
  exit 1
fi
