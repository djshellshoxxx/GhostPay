#!/usr/bin/env bash
# Runs INSIDE the integration runner container (infra/integration/docker-compose.yml, service `runner`) or any shell
# that has node >= 22, forge/cast/anvil and network access to the services. Normally started by run-all.sh.
#
# Suites (INTEGRATION_SUITES, comma separated, default evm,btc,solana):
#   evm     scripts/devnet/up.sh (deploys to the compose anvil at 127.0.0.1:8545) + scripts/devnet/e2e.mjs
#           + the apps/relayer anvil e2e (vitest; spawns its own anvil on an ephemeral port)
#   btc     scripts/integration/btc-regtest.e2e.mjs   (bitcoind regtest, BITCOIND_RPC_* env)
#   solana  scripts/integration/solana-local.e2e.mjs  (solana-test-validator, SOLANA_RPC_URL)
# Every selected suite runs even if an earlier one fails; the exit status is non-zero if any failed.
# Test fixtures that scripts/devnet writes into the tracked tree (deployments/31337.json and its web copy) are
# restored on exit so a run leaves `git status` as it found it.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
export PATH="$PATH:${HOME:-/root}/.foundry/bin"
SUITES="${INTEGRATION_SUITES:-evm,btc,solana}"
export BITCOIND_RPC_URL="${BITCOIND_RPC_URL:-http://127.0.0.1:18443}"
export SOLANA_RPC_URL="${SOLANA_RPC_URL:-http://127.0.0.1:8899}"
export DEVNET_PORT="${DEVNET_PORT:-8545}"

log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 2; }

wants() { case ",$SUITES," in *",$1,"*) return 0 ;; *) return 1 ;; esac; }
for s in ${SUITES//,/ }; do
  case "$s" in evm | btc | solana) ;; *) die "unknown suite '$s' (use evm,btc,solana)" ;; esac
done

command -v node >/dev/null || die "node not found"
[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 22 ] || die "node >= 22 required (have $(node -v))"
if wants evm; then
  for t in anvil forge cast; do command -v "$t" >/dev/null || die "$t not found (Foundry)"; done
fi

# ---- wait for services (run-all.sh already waited for compose health; this also covers manual use) ----------------
wait_for() { # name, command...
  local name="$1"; shift
  for _ in $(seq 1 90); do
    if "$@" >/dev/null 2>&1; then log "$name ready"; return 0; fi
    sleep 2
  done
  die "$name did not become ready"
}
evm_ready() {
  curl -fsS -m 3 -X POST -H 'content-type: application/json' \
    --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' "http://127.0.0.1:${DEVNET_PORT}" | grep -q '"0x7a69"'
}
btc_ready() {
  : "${BITCOIND_RPC_USER:?}" "${BITCOIND_RPC_PASSWORD:?}"
  curl -fsS -m 3 --user "${BITCOIND_RPC_USER}:${BITCOIND_RPC_PASSWORD}" -H 'content-type: text/plain;' \
    --data-binary '{"jsonrpc":"1.0","id":"w","method":"getblockchaininfo","params":[]}' "$BITCOIND_RPC_URL" | grep -q '"chain":"regtest"'
}
sol_ready() {
  curl -fsS -m 3 -X POST -H 'content-type: application/json' \
    --data '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' "$SOLANA_RPC_URL" | grep -q '"result":"ok"'
}
wants evm && wait_for "anvil (127.0.0.1:${DEVNET_PORT}, chain 31337)" evm_ready
wants btc && wait_for "bitcoind regtest (${BITCOIND_RPC_URL})" btc_ready
wants solana && wait_for "solana-test-validator (${SOLANA_RPC_URL})" sol_ready

# ---- workspace ---------------------------------------------------------------------------------------------------
log "node $(node -v), npm $(npm -v)"
[ -d node_modules/@ghostpay ] || { log "npm ci --ignore-scripts"; npm ci --ignore-scripts; }
log "build workspace libs"
npm run build:libs
wants solana && npm run build -w @ghostpay/solana-stealth
wants evm && npm run build -w @ghostpay/relayer

# ---- keep the tracked tree clean ------------------------------------------------------------------------------------
FIXTURES=(deployments/31337.json apps/web/public/deployments/31337.json)
BK="$(mktemp -d)"
for f in "${FIXTURES[@]}"; do
  if [ -f "$f" ]; then cp -p "$f" "$BK/$(basename "$(dirname "$f")")-$(basename "$f")"; fi
done
restore_fixtures() {
  for f in "${FIXTURES[@]}"; do
    b="$BK/$(basename "$(dirname "$f")")-$(basename "$f")"
    if [ -f "$b" ]; then cp -p "$b" "$f"; else rm -f "$f"; fi
  done
  rm -rf "$BK"
}
trap restore_fixtures EXIT

# ---- suites ----------------------------------------------------------------------------------------------------------
SUMMARY=()
FAILED=0
run_suite() { # name, function (the job-level timeout bounds the whole run)
  local name="$1" fn="$2" t0 rc
  log "=== suite: $name ==="
  t0=$SECONDS
  set +e
  ( set -e; "$fn" ) # subshell: `set -e` inside, failure surfaces as rc
  rc=$?
  set -e
  if [ "$rc" -eq 0 ]; then
    SUMMARY+=("PASS  $name  ($((SECONDS - t0))s)")
  else
    SUMMARY+=("FAIL  $name  ($((SECONDS - t0))s, exit $rc)")
    FAILED=1
  fi
}

suite_evm() {
  bash scripts/devnet/up.sh
  node scripts/devnet/e2e.mjs
  log "relayer anvil e2e (vitest; spawns its own anvil)"
  ( cd packages/contracts && forge build )
  ( cd apps/relayer && REQUIRE_ANVIL=1 ANVIL_BIN="$(command -v anvil)" npx vitest run src/e2e.anvil.test.ts )
}
suite_btc() { node scripts/integration/btc-regtest.e2e.mjs; }
suite_solana() { node scripts/integration/solana-local.e2e.mjs; }

wants evm && run_suite evm suite_evm
wants btc && run_suite btc suite_btc
wants solana && run_suite solana suite_solana

echo
echo "================ integration summary ================"
printf '%s\n' "${SUMMARY[@]}"
echo "====================================================="
exit "$FAILED"
