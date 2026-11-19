#!/usr/bin/env bash
# Symbolic analysis of the production contracts with Mythril. Fails on any reported issue or tool error.
# The compatibility launcher exposes internal deadline/exception signals omitted by Mythril JSON.
# This gate rejects known incomplete execution; bounded symbolic search is still not an exhaustive proof.
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
# Optional passive evidence; a fresh directory prevents stale outputs substituting for missing targets.
evidence_dir="${MYTHRIL_EVIDENCE_DIR:-}"
if [[ -n "$evidence_dir" ]]; then
  python3 scripts/capture-mythril-evidence.py start "$evidence_dir" "$conf" "$timeout" || exit 1
fi
for f in GhostPayRouter GhostPaySweepRelayer GhostPayPolicyRouter PolicyAccount PolicyAccountFactory; do
  out="$(mktemp)"
  err="$(mktemp)"
  completeness_dir="$(mktemp -d)"
  completeness="$completeness_dir/report.json"
  MYTHRIL_COMPLETENESS_FILE="$completeness" myth analyze "src/$f.sol" --solv 0.8.28 --solc-json "$conf" --execution-timeout "$timeout" -t 3 -o json >"$out" 2>"$err"
  rc=$?
  cat "$err" >&2
  cat "$out"
  if [[ -n "$evidence_dir" ]]; then
    python3 scripts/capture-mythril-evidence.py record "$evidence_dir" "$f" "$out" "$err" "$rc" "$completeness" \
      analyze "src/$f.sol" --solv 0.8.28 --solc-json "$conf" --execution-timeout "$timeout" -t 3 -o json || status=1
  fi
  # Mythril 0.24.8 reports success/error/issues in one JSON object and exits 0 for a clean report.
  # Slurp rejects extra documents; explicit types prevent null/missing issues from looking empty.
  if [[ "$rc" -ne 0 ]] || ! python3 scripts/capture-mythril-evidence.py validate-completeness "$completeness" >/dev/null 2>&1 || ! python3 scripts/capture-mythril-evidence.py validate "$out" >/dev/null 2>&1 || ! jq -es '
    length == 1 and (.[0] |
      type == "object" and .success == true and has("error") and .error == null and
      (.issues | type == "array" and length == 0))
  ' "$out" >/dev/null 2>&1; then
    echo "::error::mythril: $f reported issues or failed (rc=$rc)"; status=1
  fi
  rm -f "$out" "$err" "$completeness"
  rmdir "$completeness_dir"
done
if [[ -n "$evidence_dir" ]]; then
  python3 scripts/capture-mythril-evidence.py finish "$evidence_dir" "$status" || status=1
fi
exit "$status"
