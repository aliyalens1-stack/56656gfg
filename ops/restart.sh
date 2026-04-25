#!/usr/bin/env bash
# restart.sh [backend|expo|all]
set -euo pipefail
TARGET="${1:-all}"
case "$TARGET" in
  backend|expo) sudo supervisorctl restart "$TARGET" ;;
  all)          sudo supervisorctl restart backend expo ;;
  *) echo "usage: $0 [backend|expo|all]"; exit 1 ;;
esac
sleep 3
sudo supervisorctl status
