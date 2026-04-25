#!/usr/bin/env bash
# logs.sh [backend|expo|all]
set -uo pipefail
TARGET="${1:-all}"
case "$TARGET" in
  backend) tail -f /var/log/supervisor/backend.err.log /var/log/supervisor/backend.out.log ;;
  expo)    tail -f /var/log/supervisor/expo.err.log /var/log/supervisor/expo.out.log ;;
  all)     tail -f /var/log/supervisor/backend.err.log /var/log/supervisor/backend.out.log /var/log/supervisor/expo.err.log /var/log/supervisor/expo.out.log ;;
  *) echo "usage: $0 [backend|expo|all]"; exit 1 ;;
esac
