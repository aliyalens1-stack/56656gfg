#!/usr/bin/env bash
# stop.sh
set -euo pipefail
echo "[stop] supervisor: stop backend expo"
sudo supervisorctl stop backend expo
sudo supervisorctl status
