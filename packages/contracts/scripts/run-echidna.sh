#!/usr/bin/env bash
# Runs every Echidna harness in test/echidna/ and judges the output.
#   echidna_canary_*  EXPECTED TO FAIL (proves the success paths are reachable): a canary that passes is an error.
#   every other echidna_* property MUST pass.
# Needs echidna and crytic-compile on PATH plus forge (crytic-compile uses the foundry framework).
# Usage: scripts/run-echidna.sh [testLimit]   (default: from echidna.yaml)
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

limit_args=()
if [ -n "${1:-}" ]; then limit_args=(--test-limit "$1"); fi
status=0
for h in EchidnaRouter EchidnaSweep EchidnaPolicy; do
  out="$(mktemp)"
  echidna "test/echidna/$h.sol" --contract "$h" --config echidna.yaml --corpus-dir "echidna-corpus-$h" \
    --format text "${limit_args[@]}" >"$out" 2>&1
  rc=$?
  cat "$out"
  # A property line looks like `echidna_name: passed! ...` or `echidna_name: failed!...`.
  props="$(grep -E '^echidna_[A-Za-z0-9_]+(\(\))?: (passed|failed)' "$out" || true)"
  total="$(printf '%s\n' "$props" | grep -c . || true)"
  if [ "$total" -eq 0 ]; then
    echo "::error::$h: no property results parsed (echidna rc=$rc)"; status=1; rm -f "$out"; continue
  fi
  bad_real="$(printf '%s\n' "$props" | grep -E '^echidna_' | grep -v '^echidna_canary_' | grep ': failed' || true)"
  bad_canary="$(printf '%s\n' "$props" | grep '^echidna_canary_' | grep ': passed' || true)"
  if [ -n "$bad_real" ]; then echo "::error::$h: property FAILED:"; echo "$bad_real"; status=1; fi
  if [ -n "$bad_canary" ]; then echo "::error::$h: canary passed (success path unreachable):"; echo "$bad_canary"; status=1; fi
  rm -f "$out"
done
exit "$status"
