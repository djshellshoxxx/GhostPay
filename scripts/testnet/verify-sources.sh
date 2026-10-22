#!/usr/bin/env bash
# Block-explorer source verification for a deployed network, driven by deployments/<chainId>.json.
# Usage: scripts/testnet/verify-sources.sh <chainId|network>      (prints the forge commands; runs them only with CONFIRM_VERIFY=1)
# Env: ETHERSCAN_API_KEY (Etherscan v2 key; works for the Etherscan-family explorers incl. Sepolia/Base/OP/Arbitrum/Amoy -
#      UNVERIFIED for each chain, confirm on the explorer's API docs), VERIFIER_URL (optional, e.g. Blockscout),
#      VERIFIER (default etherscan), RPC_URL (optional).
# Compiler settings mirror packages/contracts/foundry.toml (solc 0.8.28, optimizer 200 runs, cancun).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export PATH="$PATH:/root/.foundry/bin"
case "${1:-}" in
  sepolia) id=11155111 ;; base-sepolia) id=84532 ;; op-sepolia) id=11155420 ;; arbitrum-sepolia) id=421614 ;;
  polygon-amoy) id=80002 ;; hoodi) id=560048 ;; ''|*[!0-9]*) echo "usage: $0 <chainId|network>" >&2; exit 2 ;; *) id="$1" ;;
esac
manifest="$ROOT/deployments/$id.json"
[[ -f "$manifest" ]] || { echo "no manifest $manifest" >&2; exit 1; }
field() { node -e 'const m=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=process.argv[2].split(".").reduce((a,k)=>a?.[k],m);process.stdout.write(String(v))' "$manifest" "$1"; }
router="$(field router)"; relayer="$(field sweepRelayer)"; announcer="$(field announcer)"; fee="$(field feeRecipient)"
solc="v$(field solcVersion)"
# Manifest strings are untrusted: validate strictly (same patterns as deployments/schema.json) and never pass them
# through a shell (no eval; commands are argv arrays).
addr_re='^0x[0-9a-fA-F]{40}$'
for kv in "router=$router" "sweepRelayer=$relayer" "announcer=$announcer" "feeRecipient=$fee"; do
  [[ "${kv#*=}" =~ $addr_re ]] || { echo "REFUSED: manifest field ${kv%%=*} is not a 20-byte hex address" >&2; exit 1; }
done
[[ "$solc" =~ ^v0\.8\.[0-9]+(\+commit\.[0-9a-f]{8})?$ ]] || { echo "REFUSED: manifest field solcVersion is malformed" >&2; exit 1; }
args="$(cast abi-encode 'constructor(address,address)' "$announcer" "$fee")"
common=(--chain "$id" --compiler-version "$solc" --num-of-optimizations 200 --evm-version cancun --watch)
[[ -n "${VERIFIER:-}" ]] && common+=(--verifier "$VERIFIER")
[[ -n "${VERIFIER_URL:-}" ]] && common+=(--verifier-url "$VERIFIER_URL")

router_cmd=(forge verify-contract "$router" src/GhostPayRouter.sol:GhostPayRouter --constructor-args "$args" "${common[@]}")
relayer_cmd=(forge verify-contract "$relayer" src/GhostPaySweepRelayer.sol:GhostPaySweepRelayer "${common[@]}")
if [[ "${CONFIRM_VERIFY:-}" != 1 ]]; then
  echo "DRY RUN (set CONFIRM_VERIFY=1 and ETHERSCAN_API_KEY to execute). Commands, run in packages/contracts:"
  printf '  '; printf ' %q' "${router_cmd[@]}"; printf '\n'
  printf '  '; printf ' %q' "${relayer_cmd[@]}"; printf '\n'
  exit 0
fi
[[ -n "${ETHERSCAN_API_KEY:-}" || -n "${VERIFIER_URL:-}" ]] || { echo "REFUSED: ETHERSCAN_API_KEY (or VERIFIER_URL) required" >&2; exit 1; }
cd "$ROOT/packages/contracts"
key="${ETHERSCAN_API_KEY:-}"
for name in router_cmd relayer_cmd; do
  declare -n cmd="$name"
  shown="${cmd[*]}"; [[ -n "$key" ]] && shown="${shown//"$key"/***}"
  echo "+ $shown"
  "${cmd[@]}"
done
echo "Verification submitted. Re-read FEE_RECIPIENT/FEE_BPS/ANNOUNCER and codehashes against the manifest (SmokeSepolia.s.sol)."
