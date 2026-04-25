#!/usr/bin/env bash
# start.sh — обычный warm start (deps уже установлены)
set -euo pipefail
echo "[start] supervisor: start backend expo"
sudo supervisorctl start backend expo 2>&1 || sudo supervisorctl restart backend expo
sudo supervisorctl status
