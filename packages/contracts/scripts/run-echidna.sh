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
  if ! python3 - "test/echidna/$h.sol" "$out" "$rc" <<'PY'
import re
import sys
from collections import Counter
from pathlib import Path

source, report, rc = sys.argv[1:]
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

seen = Counter()
for line in Path(report).read_text().splitlines():
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
    wanted = "failed!" if name.startswith("echidna_canary_") else "passed!"
    # `failed with no transactions made` cannot demonstrate a reachable success path.
    if not re.match(re.escape(wanted) + r"(?:\s|🎉|💥|$)", result):
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
