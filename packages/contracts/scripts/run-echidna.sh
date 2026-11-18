#!/usr/bin/env bash
# Runs every Echidna harness in test/echidna/ and judges the output.
#   echidna_canary_*  EXPECTED TO FAIL (proves the success paths are reachable): a canary that passes is an error.
#   every other echidna_* property MUST pass.
# Needs echidna, crytic-compile and python3 on PATH plus forge (crytic-compile uses the foundry framework).
# Usage: scripts/run-echidna.sh [testLimit]   (default: from echidna.yaml)
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

limit_args=()
if [ -n "${1:-}" ]; then limit_args=(--test-limit "$1"); fi
status=0
for h in EchidnaRouter EchidnaSweep EchidnaPolicy; do
  out="$(mktemp)"
  rc=0
  echidna "test/echidna/$h.sol" --contract "$h" --config echidna.yaml --corpus-dir "echidna-corpus-$h" \
    --format text "${limit_args[@]}" >"$out" 2>&1 || rc=$?
  cat "$out"
  # Check the entire declared inventory, not just whichever successful-looking lines happened to print.
  # Echidna 2.2.7 exits 1 for falsified properties (src/Main.hs); all these harnesses have expected-failing canaries.
  if ! python3 - "test/echidna/$h.sol" "$out" "$rc" "${1:-}" <<'PY'
import re
import sys
from collections import Counter
from pathlib import Path

source, report, rc, configured_limit = sys.argv[1:]
text = Path(source).read_text()
text = re.sub(r"/\*.*?\*/|//[^\n]*", "", text, flags=re.S)
declared = re.findall(r"\bfunction\s+(echidna_[A-Za-z0-9_]+)\s*\(", text)
expected = set(declared)
errors = []
if not expected or len(expected) != len(declared):
    errors.append("empty or duplicate property declarations")
if not any(name.startswith("echidna_canary_") for name in expected):
    errors.append("harness has no reachability canary")
if rc != "1":
    errors.append(f"unexpected echidna exit {rc}; expected 1 for falsified canaries")

report_text = Path(report).read_text()
# Pinned 2.2.7 prints final Open/no-reproducer properties as `passing`, even after reaching testLimit.
# Accept that spelling only with completed campaign evidence, never an interrupted progress snapshot.
# Source: crytic/echidna v2.2.7 lib/Echidna/UI/Report.hs (ppTS, ppTotalCalls).
limits = [configured_limit] if configured_limit else re.findall(r"^\s*testLimit:\s*([0-9]+)\s*(?:#.*)?$", Path("echidna.yaml").read_text(), re.M)
if len(limits) != 1 or not re.fullmatch(r"[1-9][0-9]*", limits[0]):
    errors.append("missing or invalid configured test limit")
else:
    totals = [line for line in report_text.splitlines() if line.startswith("Total calls:")]
    total = re.fullmatch(r"Total calls: ([0-9]+)\s*", totals[0]) if len(totals) == 1 else None
    if total is None or int(total[1]) < int(limits[0]):
        errors.append(f"missing, duplicate, malformed or incomplete call total; need at least {limits[0]}")

seen = Counter()
for line in report_text.splitlines():
    if not line.startswith("echidna_"):
        continue
    match = re.fullmatch(r"(echidna_[A-Za-z0-9_]+)(?:\(\))?:\s*(.*)", line)
    if match is None:
        errors.append(f"malformed property result: {line}")
        continue
    name, result = match.groups()
    seen[name] += 1
    if name not in expected:
        errors.append(f"undeclared property result: {name}")
    canary = name.startswith("echidna_canary_")
    wanted = "failed!" if canary else "passed! or passing after the configured call budget"
    # `failed with no transactions made` cannot demonstrate a reachable success path.
    valid = re.match(r"failed!(?:\s|💥|$)", result) if canary else re.fullmatch(r"(?:passing|passed!(?:\s|🎉)*)\s*", result)
    if not valid:
        errors.append(f"{name}: expected {wanted}, got {result}")

errors.extend(f"missing property result: {name}" for name in sorted(expected - seen.keys()))
errors.extend(f"duplicate property result: {name}" for name, count in seen.items() if count != 1)
for error in errors:
    print(f"::error::{Path(source).stem}: {error}")
sys.exit(bool(errors))
PY
  then status=1; fi
  rm -f "$out"
done
exit "$status"
