#!/usr/bin/env bash
# Shared helpers for the local devnet scripts. Sourced, not executed.
set -euo pipefail
DEVNET_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DEVNET_DIR/../.." && pwd)"
STATE_DIR="$DEVNET_DIR/.state"
PORT="${DEVNET_PORT:-8545}"
RPC_URL="http://127.0.0.1:${PORT}"
CHAIN_ID=31337
export PATH="$PATH:/root/.foundry/bin"

# Public anvil development mnemonic accounts. LOCAL ONLY: these keys are world-known and hold nothing real.
DEV_DEPLOYER_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" # account 0
DEV_FEE_RECIPIENT="0x70997970C51812dc3A010C7d01b50e0d17dc79C8"                          # account 1

rpc_chain_id() {
  curl -s --max-time 2 -X POST -H 'content-type: application/json' \
    --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' "$RPC_URL" 2>/dev/null |
    sed -n 's/.*"result":"\(0x[0-9a-fA-F]*\)".*/\1/p'
}

anvil_alive() {
  local id
  id="$(rpc_chain_id || true)"
  [ -n "$id" ] && [ "$((id))" -eq "$CHAIN_ID" ]
}
