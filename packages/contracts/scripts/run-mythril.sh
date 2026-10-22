#!/usr/bin/env bash
# Symbolic analysis of the production contracts with Mythril. Fails on any reported issue or tool error.
# Needs `myth` on PATH (pip install mythril) and solc 0.8.28 (svm/solc-select/local). Issues that are accepted by
# design must be documented in docs/audits/ and suppressed with --exclude-swc, not by weakening this script.
# Usage: scripts/run-mythril.sh [execution-timeout-seconds]
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

timeout="${1:-900}"
conf="$(mktemp)"
trap 'rm -f "$conf"' EXIT
cat >"$conf" <<JSON
{"remappings": ["@openzeppelin/contracts/=$PWD/lib/openzeppelin-contracts/contracts/"],
 "optimizer": {"enabled": true, "runs": 200}, "evmVersion": "cancun"}
JSON
status=0
for f in GhostPayRouter GhostPaySweepRelayer GhostPayPolicyRouter PolicyAccount PolicyAccountFactory; do
  out="$(mktemp)"
  myth analyze "src/$f.sol" --solv 0.8.28 --solc-json "$conf" --execution-timeout "$timeout" -t 3 -o json >"$out"
  rc=$?
  cat "$out"
  if ! jq -e '.success == true and (.issues | length == 0)' "$out" >/dev/null 2>&1; then
    echo "::error::mythril: $f reported issues or failed (rc=$rc)"; status=1
  fi
  rm -f "$out"
done
exit "$status"
