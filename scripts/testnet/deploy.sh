#!/usr/bin/env bash
# GhostPay testnet deployment driver (Deploy.s.sol: router + sweep relayer against an ERC-5564 announcer).
#
# Usage: scripts/testnet/deploy.sh <network> [simulate|rehearse|broadcast]
#   networks : sepolia (11155111) | base-sepolia (84532) | op-sepolia (11155420) | arbitrum-sepolia (421614)
#              | polygon-amoy (80002) | hoodi (560048)
#   simulate : (default) forge script WITHOUT --broadcast against RPC_URL. Sends nothing, needs no key.
#   rehearse : full dry run on a throw-away LOCAL anvil that reports the target chain id (no fork, no network):
#              etches the reference announcer at the canonical address, runs the real Deploy.s.sol with the public
#              anvil dev key, builds + validates a manifest into a temp dir, then discards everything.
#   broadcast: REAL deployment. Refuses unless CONFIRM_BROADCAST=1 AND a signer is supplied by the human.
#
# Env:
#   RPC_URL            required for simulate/broadcast (https endpoint of the target testnet)
#   FEE_RECIPIENT      required (not the deployer; EOA/multisig able to receive ETH and the fee token)
#   KEYSTORE_ACCOUNT   broadcast signer: name of a `cast wallet import` keystore (preferred; forge prompts for the password)
#   PRIVATE_KEY        broadcast signer alternative, supplied by the human (visible in `ps` while forge runs: prefer keystore)
#   DEPLOYER_ADDRESS   simulate: REQUIRED public address of your funded testnet deployer (forge needs a funded sender to estimate gas)
#   CONFIRM_BROADCAST  must be exactly 1 for broadcast
#   ANNOUNCER / ALLOW_CUSTOM_ANNOUNCER / EXPECTED_ANNOUNCER_CODEHASH : see packages/contracts/script/Deploy.s.sol
#   SKIP_WEB_COPY=1    do not copy the manifest to apps/web/public/deployments/
# No key, address or RPC URL is stored by this script. Exit codes: 0 ok, 1 failed check, 2 usage.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export PATH="$PATH:/root/.foundry/bin"
CONTRACTS="$ROOT/packages/contracts"
CANONICAL_ANNOUNCER=0x55649E01B5Df198D18D95b5cc5051630cfD45564
DEV_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 # public anvil account 0, local rehearsal only

network="${1:-}"
mode="${2:-simulate}"
case "$network" in
  sepolia) chain_id=11155111 ;;
  base-sepolia) chain_id=84532 ;;
  op-sepolia) chain_id=11155420 ;;
  arbitrum-sepolia) chain_id=421614 ;;
  polygon-amoy) chain_id=80002 ;;
  hoodi) chain_id=560048 ;;
  *) echo "usage: $0 <sepolia|base-sepolia|op-sepolia|arbitrum-sepolia|polygon-amoy|hoodi> [simulate|rehearse|broadcast]" >&2; exit 2 ;;
esac
case "$mode" in simulate | rehearse | broadcast) ;; *) echo "unknown mode '$mode'" >&2; exit 2 ;; esac

die() { echo "REFUSED: $*" >&2; exit 1; }
[[ "${FEE_RECIPIENT:-}" =~ ^0x[0-9a-fA-F]{40}$ ]] || die "FEE_RECIPIENT must be set to a 0x address"
command -v forge >/dev/null || die "forge not on PATH"
BROADCAST_DIR="$CONTRACTS/broadcast/Deploy.s.sol/$chain_id"

# ---------------------------------------------------------------- rehearse (local anvil, no network)
if [[ "$mode" == rehearse ]]; then
  command -v anvil >/dev/null || die "anvil not on PATH"
  [[ ! -e "$BROADCAST_DIR/run-latest.json" ]] || die "$BROADCAST_DIR/run-latest.json exists (a real deployment record?); move it away before a rehearsal"
  port="${REHEARSE_PORT:-18546}"
  tmp="$(mktemp -d)"
  anvil --host 127.0.0.1 --port "$port" --chain-id "$chain_id" --silent >"$tmp/anvil.log" 2>&1 &
  apid=$!
  cleanup() { kill "$apid" 2>/dev/null || true; find "$BROADCAST_DIR" -maxdepth 1 -type f -delete 2>/dev/null || true; rm -rf "$CONTRACTS/cache/Deploy.s.sol/$chain_id/run-latest.json" "$tmp"; }
  trap cleanup EXIT
  local_rpc="http://127.0.0.1:$port"
  for _ in $(seq 1 50); do cast chain-id --rpc-url "$local_rpc" >/dev/null 2>&1 && break; sleep 0.2; done
  [[ "$(cast chain-id --rpc-url "$local_rpc")" == "$chain_id" ]] || die "local anvil did not come up with chain id $chain_id"
  runtime="$(node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(j.deployedBytecode.object)' "$CONTRACTS/out/ERC5564Announcer.sol/ERC5564Announcer.json")"
  [[ -n "$runtime" ]] || die "missing forge artifact; run 'forge build' in packages/contracts"
  cast rpc anvil_setCode "$CANONICAL_ANNOUNCER" "$runtime" --rpc-url "$local_rpc" >/dev/null
  # Same flags a real run uses, only the signer (public dev key) and RPC differ.
  (cd "$CONTRACTS" && forge script script/Deploy.s.sol --rpc-url "$local_rpc" --broadcast --slow --private-key "$DEV_KEY")
  out="$tmp/$chain_id.json"
  node "$ROOT/scripts/testnet/make-manifest.mjs" --rpc "$local_rpc" --broadcast "$BROADCAST_DIR/run-latest.json" --out "$out"
  ROUTER="$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).router)' "$out")"
  RELAYER="$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).sweepRelayer)' "$out")"
  (cd "$CONTRACTS" && ROUTER="$ROUTER" SWEEP_RELAYER="$RELAYER" forge script script/SmokeSepolia.s.sol --rpc-url "$local_rpc")
  echo "REHEARSAL OK for $network ($chain_id): Deploy.s.sol, make-manifest.mjs and SmokeSepolia.s.sol all passed locally. Nothing persisted."
  exit 0
fi

# ---------------------------------------------------------------- simulate / broadcast against RPC_URL
[[ -n "${RPC_URL:-}" ]] || die "RPC_URL is required"
actual="$(cast chain-id --rpc-url "$RPC_URL" 2>/dev/null || true)"
[[ "$actual" == "$chain_id" ]] || die "RPC_URL reports chain id '${actual:-unreachable}', expected $chain_id for $network"

SENDER="${DEPLOYER_ADDRESS:-}" FEE_RECIPIENT="$FEE_RECIPIENT" RPC_URL="$RPC_URL" bash "$CONTRACTS/scripts/pre-deploy-check.sh" router

if [[ "$mode" == simulate ]]; then
  [[ "${DEPLOYER_ADDRESS:-}" =~ ^0x[0-9a-fA-F]{40}$ ]] || die "simulate needs DEPLOYER_ADDRESS (public address of the funded deployer)"
  (cd "$CONTRACTS" && forge script script/Deploy.s.sol --rpc-url "$RPC_URL" --sender "$DEPLOYER_ADDRESS")
  echo "SIMULATION ONLY: nothing was broadcast."
  exit 0
fi

# broadcast
[[ "${CONFIRM_BROADCAST:-}" == 1 ]] || die "broadcast needs CONFIRM_BROADCAST=1"
signer_args=()
if [[ -n "${KEYSTORE_ACCOUNT:-}" && -n "${PRIVATE_KEY:-}" ]]; then die "set only one of KEYSTORE_ACCOUNT and PRIVATE_KEY"; fi
if [[ -n "${KEYSTORE_ACCOUNT:-}" ]]; then signer_args=(--account "$KEYSTORE_ACCOUNT")
elif [[ -n "${PRIVATE_KEY:-}" ]]; then
  [[ "$PRIVATE_KEY" =~ ^(0x)?[0-9a-fA-F]{64}$ ]] || die "PRIVATE_KEY is not a 32-byte hex key"
  [[ "$PRIVATE_KEY" != "$DEV_KEY" ]] || die "refusing the public anvil dev key on a public network"
  signer_args=(--private-key "$PRIVATE_KEY")
else die "no signer: set KEYSTORE_ACCOUNT (preferred) or PRIVATE_KEY"; fi
[[ ! -e "$BROADCAST_DIR/run-latest.json" ]] || die "$BROADCAST_DIR/run-latest.json already exists (earlier deployment). Archive it or use --resume manually"

(cd "$CONTRACTS" && forge script script/Deploy.s.sol --rpc-url "$RPC_URL" --broadcast --slow "${signer_args[@]}")

manifest_args=(--rpc "$RPC_URL" --broadcast "$BROADCAST_DIR/run-latest.json" --out "$ROOT/deployments/$chain_id.json")
[[ "${SKIP_WEB_COPY:-}" == 1 ]] || manifest_args+=(--copy-web)
node "$ROOT/scripts/testnet/make-manifest.mjs" "${manifest_args[@]}"
ROUTER="$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).router)' "$ROOT/deployments/$chain_id.json")"
RELAYER="$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).sweepRelayer)' "$ROOT/deployments/$chain_id.json")"
(cd "$CONTRACTS" && ROUTER="$ROUTER" SWEEP_RELAYER="$RELAYER" forge script script/SmokeSepolia.s.sol --rpc-url "$RPC_URL")
echo "DEPLOYED $network ($chain_id). Next: scripts/testnet/verify-sources.sh $network, then review + commit deployments/$chain_id.json via PR."
