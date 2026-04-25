#!/usr/bin/env bash
# check-deprecated-collections.sh — warns if deprecated collections have data
# Deprecated list is derived from /app/memory/DATA_OWNERSHIP.md Section 5.
set -uo pipefail
DB="${DB_NAME:-auto_platform}"
RED='\033[1;31m'; GREEN='\033[1;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

# Canonical deprecated collections (should stay empty or be dropped)
DEPRECATED=(
  "geozones"     # canonical = zones
)

# Ambiguous similar-name (NOT strict dupes — NestJS-reserved for future features).
# Log their counts for awareness; not failures.
AMBIGUOUS=(
  "audits"                  # business audit stream (entity/actor); admin uses audit_logs
  "provideravailabilities"
  "providerlivelocations"
  "providerservices"
  "providerblockedtimes"
)

echo "🔎 Deprecated & ambiguous collection scan  (DB=$DB)"

FAIL=0
echo ""
echo "→ Deprecated (should be 0 or non-existent):"
for c in "${DEPRECATED[@]}"; do
  n=$(mongosh --quiet "$DB" --eval "print(db.$c.countDocuments())" 2>/dev/null || echo "0")
  if [[ "$n" == "0" ]]; then
    echo -e "  ${GREEN}✓${NC} $c = 0"
  else
    echo -e "  ${RED}⚠${NC} $c has $n docs — needs migration (see ops/migrate-collections.js)"
    FAIL=$((FAIL+1))
  fi
done

echo ""
echo "→ Ambiguous (NestJS-reserved; non-zero means feature in use, expected):"
for c in "${AMBIGUOUS[@]}"; do
  n=$(mongosh --quiet "$DB" --eval "print(db.$c.countDocuments())" 2>/dev/null || echo "0")
  if [[ "$n" == "0" ]]; then
    echo -e "  ${GREEN}·${NC} $c = 0 (reserved)"
  else
    echo -e "  ${YELLOW}i${NC} $c = $n (active NestJS feature)"
  fi
done

echo ""
if [[ $FAIL -eq 0 ]]; then
  echo -e "${GREEN}✓ No deprecated collections with data${NC}"
  exit 0
else
  echo -e "${RED}✗ $FAIL deprecated collection(s) non-empty${NC}"
  exit 1
fi
