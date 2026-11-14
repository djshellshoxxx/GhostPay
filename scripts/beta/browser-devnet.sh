#!/usr/bin/env bash
# Browser journey against a REAL local anvil chain: the built web app (vite build + preview) drives real contracts and
# real transactions through Playwright (apps/web/playwright.devnet.config.ts -> apps/web/e2e/devnet-journey.spec.ts).
#
#   1. anvil on 127.0.0.1:${BROWSER_DEVNET_PORT:-8546} (never 8545, which belongs to scripts/devnet/up.sh), chain 31337;
#   2. the unmodified script/devnet/DeployDevnet.s.sol (it only deploys on 31337), with forge out/cache/broadcast in a
#      temp dir: nothing is written to deployments/, scripts/devnet/.state or packages/contracts/{out,cache,broadcast};
#   3. anvil_setChainId 84532: from here on every app transaction is signed and executed as Base Sepolia (the web app
#      bundles no 31337 deployment by design); a stub GasPriceOracle predeploy answers 0 (anvil charges no L1 data fee);
#   4. apps/web/e2e/devnet/prepare-devnet-manifest.mjs builds the 84532 manifest from the broadcast, reads it back on
#      chain and signs it with the public Playwright test key (refuses unless loopback + chain 84532 + anvil);
#   5. Playwright builds the app with that manifest and runs the devnet spec; anvil is torn down on exit.
#
# Public anvil dev keys only (local, world-known, no value). Exit status is Playwright's (or the first failing step's).
# Env: BROWSER_DEVNET_PORT (8546), BROWSER_DEVNET_WEB_PORT (4174), BROWSER_DEVNET_KEEP=1 keeps the temp dir.
#
# Opt-in BROWSER_DEVNET_MODE=pages: steps 1-4 are identical; step 5 instead runs apps/web/playwright.pages-devnet.config.ts,
# which builds the actual GitHub Pages artifact (scripts/pages/build-pages.sh, lean profile, with this run's signed
# manifest) into "$WORK/pages", serves it under /GhostPay/ with scripts/pages/serve-pages.mjs on
# BROWSER_DEVNET_PAGES_PORT (4175; never 4173/4174) and runs e2e/pages-devnet.spec.ts against it.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PORT="${BROWSER_DEVNET_PORT:-8546}"
WEB_PORT="${BROWSER_DEVNET_WEB_PORT:-4174}"
RPC_URL="http://127.0.0.1:${PORT}"
export PATH="$HOME/.foundry/bin:$PATH"

# Public anvil development mnemonic accounts (same as scripts/devnet/lib.sh). LOCAL ONLY.
DEV_DEPLOYER_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" # account 0
DEV_FEE_RECIPIENT="0x70997970C51812dc3A010C7d01b50e0d17dc79C8"                          # account 1
OP_GAS_PRICE_ORACLE="0x420000000000000000000000000000000000000F"
# PUSH1 0x20 PUSH1 0x00 RETURN: answers every call with one zero word (L1 data fee and operator fee are 0 here).
ZERO_WORD_CODE="0x60206000f3"

die() { echo "browser-devnet: $*" >&2; exit 1; }
[ "$PORT" != "8545" ] || die "port 8545 is reserved for scripts/devnet; use another BROWSER_DEVNET_PORT"
[ "$WEB_PORT" != "4173" ] || die "web port 4173 is used by the mocked Playwright suite; use another BROWSER_DEVNET_WEB_PORT"
MODE="${BROWSER_DEVNET_MODE:-default}"
case "$MODE" in default|pages) ;; *) die "unknown BROWSER_DEVNET_MODE '$MODE' (expected default or pages)" ;; esac
PAGES_PORT="${BROWSER_DEVNET_PAGES_PORT:-4175}"
if [ "$MODE" = "pages" ]; then
  case "$PAGES_PORT" in 4173|4174) die "pages port $PAGES_PORT belongs to another Playwright suite; use another BROWSER_DEVNET_PAGES_PORT" ;; esac
fi
for tool in anvil forge node curl; do command -v "$tool" >/dev/null || die "$tool not found (PATH needs ~/.foundry/bin)"; done

rpc() { # rpc <method> <json params>  -> prints the raw JSON reply; fails on transport or JSON-RPC error
  local reply
  reply="$(curl -sS --noproxy '*' --max-time 10 -X POST -H 'content-type: application/json' \
    --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$1\",\"params\":${2:-[]}}" "$RPC_URL")" || return 1
  case "$reply" in *'"error"'*) echo "$reply" >&2; return 1 ;; esac
  printf '%s' "$reply"
}

if curl -s --noproxy '*' --max-time 1 "$RPC_URL" >/dev/null 2>&1; then die "something already listens on $RPC_URL; refusing to reuse it"; fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/ghostpay-browser-devnet.XXXXXX")"
ANVIL_PID=""
cleanup() {
  local status=$?
  if [ -n "$ANVIL_PID" ] && kill -0 "$ANVIL_PID" 2>/dev/null; then
    kill "$ANVIL_PID" 2>/dev/null || true
    wait "$ANVIL_PID" 2>/dev/null || true
  fi
  if [ "$status" -ne 0 ] && [ -f "$WORK/anvil.log" ]; then
    echo "browser-devnet: FAILED (exit $status); last anvil log lines:" >&2
    tail -n 20 "$WORK/anvil.log" >&2 || true
  fi
  if [ "${BROWSER_DEVNET_KEEP:-0}" = "1" ]; then echo "browser-devnet: kept $WORK" >&2; else rm -rf "$WORK"; fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

echo "== anvil on $RPC_URL"
anvil --host 127.0.0.1 --port "$PORT" --chain-id 31337 >"$WORK/anvil.log" 2>&1 &
ANVIL_PID=$!
for _ in $(seq 1 50); do
  rpc eth_chainId >/dev/null 2>&1 && break
  kill -0 "$ANVIL_PID" 2>/dev/null || die "anvil exited during startup"
  sleep 0.2
done
case "$(rpc web3_clientVersion)" in *'"anvil/'*) ;; *) die "$RPC_URL is not anvil" ;; esac

echo "== deploy (script/devnet/DeployDevnet.s.sol, isolated forge out/cache/broadcast)"
(
  cd "$ROOT/packages/contracts"
  FOUNDRY_OUT="$WORK/forge-out" FOUNDRY_CACHE_PATH="$WORK/forge-cache" FOUNDRY_BROADCAST="$WORK/broadcast" \
    FEE_RECIPIENT="$DEV_FEE_RECIPIENT" forge script script/devnet/DeployDevnet.s.sol:DeployDevnet --offline \
    --rpc-url "$RPC_URL" --broadcast --private-key "$DEV_DEPLOYER_KEY" --slow >"$WORK/forge.log" 2>&1
) || { tail -n 30 "$WORK/forge.log" >&2; die "forge deploy failed"; }
BROADCAST="$WORK/broadcast/DeployDevnet.s.sol/31337/run-latest.json"
[ -f "$BROADCAST" ] || die "broadcast file missing"

echo "== switch the local chain to Base Sepolia id (84532) and stub the OP fee oracle"
rpc anvil_setChainId '[84532]' >/dev/null
case "$(rpc eth_chainId)" in *'"0x14a34"'*) ;; *) die "anvil_setChainId did not take effect" ;; esac
rpc anvil_setCode "[\"$OP_GAS_PRICE_ORACLE\",\"$ZERO_WORD_CODE\"]" >/dev/null

echo "== sign the devnet manifest with the public Playwright test key"
node "$ROOT/apps/web/e2e/devnet/prepare-devnet-manifest.mjs" --rpc "$RPC_URL" --broadcast "$BROADCAST" \
  --artifacts "$WORK/forge-out" --out-dir "$WORK/deployments" --state "$WORK/devnet.json"

if [ "$MODE" = "pages" ]; then
  echo "== playwright (GitHub Pages artifact on http://localhost:$PAGES_PORT/GhostPay/ against $RPC_URL)"
  cd "$ROOT/apps/web"
  GHOSTPAY_DEVNET_STATE="$WORK/devnet.json" GHOSTPAY_PAGES_OUT="$WORK/pages" GHOSTPAY_PAGES_WEB_PORT="$PAGES_PORT" \
    npx playwright test -c playwright.pages-devnet.config.ts
  echo "browser-devnet: PASS (pages)"
else
echo "== playwright (built app on http://localhost:$WEB_PORT against $RPC_URL)"
cd "$ROOT/apps/web"
GHOSTPAY_DEVNET_STATE="$WORK/devnet.json" GHOSTPAY_DEVNET_DIST="$WORK/dist" GHOSTPAY_DEVNET_WEB_PORT="$WEB_PORT" \
  npx playwright test -c playwright.devnet.config.ts
echo "browser-devnet: PASS"
fi
