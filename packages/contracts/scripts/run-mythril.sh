#!/usr/bin/env bash
# Symbolic analysis of the production contracts with Mythril. Fails on any reported issue or tool error.
# Mythril JSON omits report.exceptions; passing this output gate does not prove complete symbolic execution.
# Needs `myth` on PATH (pip install mythril) and solc 0.8.28 (svm/solc-select/local). Mythril 0.24.8 has no per-SWC
# exclusion flag (only the whole-detector `-m` module whitelist) and no inline suppression. Every reported issue keeps
# this gate red until the source changes or a separately reviewed, owner-approved, finding-specific disposition
# mechanism exists; record each issue's disposition in docs/audits/ and never weaken this script to pass.
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
  # Mythril 0.24.8 reports success/error/issues in one JSON object and exits 0 for a clean report.
  # Slurp rejects extra documents; explicit types prevent null/missing issues from looking empty.
  if [[ "$rc" -ne 0 ]] || ! jq -es '
    length == 1 and (.[0] |
      type == "object" and .success == true and has("error") and .error == null and
      (.issues | type == "array" and length == 0))
  ' "$out" >/dev/null 2>&1; then
    echo "::error::mythril: $f reported issues or failed (rc=$rc)"; status=1
  fi
  rm -f "$out"
done
exit "$status"
