#!/usr/bin/env bash
# split-check.sh — верификация, что frontend/admin/web-app не импортят друг друга
# (изоляция модулей: ни один не должен зависеть от соседа)
set -uo pipefail
cd "$(dirname "$0")/.."

RED='\033[1;31m'; GREEN='\033[1;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
FAIL=0

check() {
  local name="$1" dir="$2" forbidden="$3"
  # ищем только в src/ и app/ (не в node_modules, dist, build)
  local hits
  hits=$(grep -rnE "from ['\"]\.\.?/\.\./\.\./$forbidden|from ['\"]/$forbidden|from ['\"]\.\./\.\./$forbidden" \
    --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" \
    "$dir/src" "$dir/app" 2>/dev/null | head -5 || true)
  if [[ -z "$hits" ]]; then
    echo -e "  ${GREEN}✓${NC} $name не импортит $forbidden/"
  else
    echo -e "  ${RED}✗${NC} $name зависит от $forbidden/:"
    echo "$hits" | sed 's/^/    /'
    FAIL=$((FAIL+1))
  fi
}

check_exists() {
  local name="$1" path="$2"
  if [[ -e "$path" ]]; then
    echo -e "  ${GREEN}✓${NC} $name"
  else
    echo -e "  ${RED}✗${NC} $name отсутствует: $path"
    FAIL=$((FAIL+1))
  fi
}

echo "🔐 Проверка изоляции модулей"
echo ""

echo "1. Структура каталогов"
check_exists "frontend/ (mobile)"   "frontend/app"
check_exists "admin/ (panel)"       "admin/src"
check_exists "web-app/ (marketplace)" "web-app/src"
check_exists "backend/ (FastAPI)"   "backend/server.py"
check_exists "backend/src (NestJS)" "backend/src/main.ts"

echo ""
echo "2. Cross-module imports"
check "frontend/ (mobile)"    frontend "admin"
check "frontend/ (mobile)"    frontend "web-app"
check "admin/"                admin    "frontend"
check "admin/"                admin    "web-app"
check "web-app/"              web-app  "frontend"
check "web-app/"              web-app  "admin"

echo ""
echo "3. Build artefacts"
check_exists "admin/dist/index.html"   "admin/dist/index.html"
check_exists "web-app/dist/index.html" "web-app/dist/index.html"
check_exists "backend/dist/main.js"    "backend/dist/main.js"

echo ""
if [[ "$FAIL" -eq 0 ]]; then
  echo -e "${GREEN}✓ Изоляция соблюдена${NC}"
  exit 0
else
  echo -e "${RED}✗ $FAIL проблем${NC}"
  exit 1
fi
