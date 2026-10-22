#!/usr/bin/env bash
# Starts a local anvil (chain id 31337) and deploys the full GhostPay devnet stack.
# Idempotent: re-running with a live, already deployed devnet changes nothing.
# Writes deployments/31337.json (schema-validated) and scripts/devnet/.state/devnet.json
# (token + account addresses for the e2e script). Chain 31337 is intentionally not a bundled web deployment.
# Env: DEVNET_PORT (8545). Needs foundry (anvil, forge, cast) and node >= 22.
set -euo pipefail
# shellcheck source=lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

command -v anvil >/dev/null || { echo "anvil not found (PATH needs ~/.foundry/bin)" >&2; exit 1; }
command -v forge >/dev/null || { echo "forge not found" >&2; exit 1; }
mkdir -p "$STATE_DIR"

if anvil_alive; then
  echo "anvil already running on $RPC_URL"
else
  if [ -f "$STATE_DIR/anvil.pid" ] && kill -0 "$(cat "$STATE_DIR/anvil.pid")" 2>/dev/null; then
    echo "anvil pid file points at a live process that does not answer on $RPC_URL" >&2
    exit 1
  fi
  nohup anvil --host 127.0.0.1 --port "$PORT" --chain-id "$CHAIN_ID" >"$STATE_DIR/anvil.log" 2>&1 &
  echo $! >"$STATE_DIR/anvil.pid"
  for _ in $(seq 1 50); do
    anvil_alive && break
    sleep 0.2
  done
  anvil_alive || { echo "anvil failed to start; see $STATE_DIR/anvil.log" >&2; exit 1; }
  echo "anvil started (pid $(cat "$STATE_DIR/anvil.pid")) on $RPC_URL"
fi

MANIFEST="$ROOT/deployments/$CHAIN_ID.json"
STATE_JSON="$STATE_DIR/devnet.json"

deployed() {
  [ -f "$MANIFEST" ] && [ -f "$STATE_JSON" ] || return 1
  local router code
  router="$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).router)' "$MANIFEST")"
  code="$(cast code "$router" --rpc-url "$RPC_URL" 2>/dev/null || true)"
  [ -n "$code" ] && [ "$code" != "0x" ]
}

if deployed; then
  echo "devnet already deployed ($MANIFEST); nothing to do"
  exit 0
fi

# Fresh chain (or stale manifest from a previous anvil): wipe stale outputs, deploy.
rm -f "$MANIFEST" "$STATE_JSON" "$ROOT/apps/web/public/deployments/$CHAIN_ID.json"
rm -rf "$ROOT/packages/contracts/broadcast/DeployDevnet.s.sol/$CHAIN_ID"

(
  cd "$ROOT/packages/contracts"
  FEE_RECIPIENT="$DEV_FEE_RECIPIENT" forge script script/devnet/DeployDevnet.s.sol:DeployDevnet \
    --rpc-url "$RPC_URL" --broadcast --private-key "$DEV_DEPLOYER_KEY" --slow
)

BROADCAST="$ROOT/packages/contracts/broadcast/DeployDevnet.s.sol/$CHAIN_ID/run-latest.json"
node "$ROOT/scripts/testnet/make-manifest.mjs" --rpc "$RPC_URL" --broadcast "$BROADCAST" --out "$MANIFEST"
node "$DEVNET_DIR/write-state.mjs" "$BROADCAST" "$STATE_JSON" "$RPC_URL"
echo "devnet up: rpc=$RPC_URL chainId=$CHAIN_ID manifest=$MANIFEST"
