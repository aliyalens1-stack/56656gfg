#!/usr/bin/env bash
# bootstrap.sh — Cold start: fresh clone / new pod
# Устанавливает всё, собирает статику, запускает supervisor
set -euo pipefail
cd "$(dirname "$0")/.."

log()  { echo -e "\033[1;34m[bootstrap]\033[0m $*"; }
ok()   { echo -e "\033[1;32m  ✓\033[0m $*"; }
warn() { echo -e "\033[1;33m  !\033[0m $*"; }
die()  { echo -e "\033[1;31m  ✗\033[0m $*"; exit 1; }

# ── 0. Проверка окружения
log "0. Проверка окружения"
command -v python3 >/dev/null || die "python3 не найден"
command -v node    >/dev/null || die "node не найден"
command -v yarn    >/dev/null || die "yarn не найден"
command -v mongod  >/dev/null || warn "mongod не в PATH (ок если через supervisor)"
[[ -f backend/.env ]]  || die "backend/.env отсутствует"
[[ -f frontend/.env ]] || die "frontend/.env отсутствует"
ok "env ok"

# ── 1. Python deps (FastAPI + Phase E/G/H)
log "1. pip install backend/requirements.txt"
pip install -q -r backend/requirements.txt
ok "python deps installed"

# ── 2. NestJS deps + build
log "2. NestJS backend: install + build"
( cd backend && npm install --silent --no-audit --no-fund --legacy-peer-deps )
( cd backend && npx nest build )
[[ -f backend/dist/main.js ]] || die "backend/dist/main.js не собрался"
ok "NestJS compiled → backend/dist/main.js"

# ── 3. Admin panel: install + build (полностью изолированно)
log "3. Admin panel: install + build"
( cd admin && npm install --silent --no-audit --no-fund --legacy-peer-deps )
( cd admin && npm run build )
[[ -f admin/dist/index.html ]] || die "admin/dist/index.html не собрался"
ok "Admin built → admin/dist/"

# ── 4. Web marketplace: install + build (полностью изолированно)
log "4. Web-app: install + build"
( cd web-app && npm install --silent --no-audit --no-fund --legacy-peer-deps )
( cd web-app && npm run build )
[[ -f web-app/dist/index.html ]] || die "web-app/dist/index.html не собрался"
ok "Web-app built → web-app/dist/"

# ── 5. Mobile (Expo): install (без сборки — metro бандлит live)
log "5. Mobile Expo: yarn install"
( cd frontend && yarn install --silent )
ok "Mobile deps installed"

# ── 6. Supervisor: рестарт сервисов
log "6. Supervisor restart"
sudo supervisorctl restart backend expo >/dev/null 2>&1 || true
sleep 15
sudo supervisorctl status

# ── 7. Health
log "7. Health check"
bash "$(dirname "$0")/health.sh" || warn "health check показал ошибки — проверь логи"

echo ""
echo -e "\033[1;32m═══════════════════════════════════════════════════════════\033[0m"
echo -e "\033[1;32m ✓  Bootstrap завершён\033[0m"
echo -e "\033[1;32m═══════════════════════════════════════════════════════════\033[0m"
URL="${EXPO_PUBLIC_BACKEND_URL:-https://full-stack-deploy-69.preview.emergentagent.com}"
cat <<EOF

📱 Mobile:       $URL/
🛠  Admin:       $URL/api/admin-panel/
🌐 Web:          $URL/api/web-app/
🔌 API Health:   $URL/api/health

Credentials:
  Admin:    admin@autoservice.com / Admin123!
  Customer: customer@test.com / Customer123!
  Provider: provider@test.com / Provider123!

EOF
