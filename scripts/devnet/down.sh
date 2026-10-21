#!/usr/bin/env bash
# Stops the devnet anvil started by up.sh and removes generated devnet outputs. Idempotent.
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

if [ -f "$STATE_DIR/anvil.pid" ]; then
  pid="$(cat "$STATE_DIR/anvil.pid")"
  if kill -0 "$pid" 2>/dev/null && ps -p "$pid" -o comm= | grep -q anvil; then
    kill "$pid" || true
    for _ in $(seq 1 25); do kill -0 "$pid" 2>/dev/null || break; sleep 0.2; done
    echo "anvil $pid stopped"
  fi
  rm -f "$STATE_DIR/anvil.pid"
else
  echo "no pid file; nothing to stop"
fi
rm -f "$ROOT/deployments/$CHAIN_ID.json" "$ROOT/apps/web/public/deployments/$CHAIN_ID.json" "$STATE_DIR/devnet.json"
rm -rf "$ROOT/packages/contracts/broadcast/DeployDevnet.s.sol/$CHAIN_ID"
echo "devnet down"
