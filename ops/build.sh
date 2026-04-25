#!/usr/bin/env bash
# build.sh [admin|web|nest|mobile|all]
set -euo pipefail
cd "$(dirname "$0")/.."

TARGET="${1:-all}"

build_admin() {
  echo "── Building admin/ (Vite)..."
  ( cd admin && [[ -d node_modules ]] || npm install --silent --legacy-peer-deps --no-audit --no-fund )
  ( cd admin && npm run build )
  [[ -f admin/dist/index.html ]] && echo "  ✓ admin/dist ready"
}

build_web() {
  echo "── Building web-app/ (Vite)..."
  ( cd web-app && [[ -d node_modules ]] || npm install --silent --legacy-peer-deps --no-audit --no-fund )
  ( cd web-app && npm run build )
  [[ -f web-app/dist/index.html ]] && echo "  ✓ web-app/dist ready"
}

build_nest() {
  echo "── Building backend/ (NestJS)..."
  ( cd backend && [[ -d node_modules ]] || npm install --silent --legacy-peer-deps --no-audit --no-fund )
  ( cd backend && npx nest build )
  [[ -f backend/dist/main.js ]] && echo "  ✓ backend/dist/main.js ready"
}

build_mobile() {
  echo "── Mobile Expo: нет отдельной сборки (Metro runtime)."
  ( cd frontend && [[ -d node_modules ]] || yarn install --silent )
  echo "  ✓ frontend/node_modules ready"
}

case "$TARGET" in
  admin)  build_admin ;;
  web)    build_web ;;
  nest)   build_nest ;;
  mobile) build_mobile ;;
  all)    build_admin; build_web; build_nest; build_mobile ;;
  *) echo "usage: $0 [admin|web|nest|mobile|all]"; exit 1 ;;
esac

echo ""
echo "✓ build done: $TARGET"
