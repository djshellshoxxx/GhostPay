#!/usr/bin/env bash
# Fails (exit 1, listing file:line) if `tx.origin` appears in Solidity sources under packages/*/src/** or
# packages/*/contracts/** (spec 04: contracts must not authenticate or branch on tx.origin).
# Fail-closed by design: only pure line comments (a line whose first non-blank characters are `//`) and the body of a
# block comment that starts a line (`/*` ... `*/`) are skipped. A trailing `// tx.origin` comment on a code line, a
# `/* x */ code` line, a `*`-prefixed continuation line or a string containing `//` are all checked, so a mention there
# fails and must be reworded. Test and script directories are excluded; `lib` directories are not (packages/*/src/lib
# holds deployed library code; vendored forge-std lives outside the scanned roots).
# Usage: scripts/check-tx-origin.sh [repo-root]   (default: repository root)
set -euo pipefail

root="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
status=0
count=0

while IFS= read -r file; do
  count=$((count + 1))
  lineno=0
  in_block=0
  while IFS= read -r line || [ -n "$line" ]; do
    lineno=$((lineno + 1))
    code="$line"
    if [ "$in_block" -eq 1 ]; then
      # Inside a block comment: skip up to and including the closing `*/`, check whatever follows it.
      if [[ "$code" == *'*/'* ]]; then
        code="${code#*\*/}"
        in_block=0
      else
        continue
      fi
    elif [[ "$code" =~ ^[[:space:]]*// ]]; then
      continue
    elif [[ "$code" =~ ^[[:space:]]*/\* ]]; then
      if [[ "$code" == *'*/'* ]]; then
        code="${code#*\*/}"
      else
        in_block=1
        continue
      fi
    fi
    if [[ "$code" =~ tx[[:space:]]*\.[[:space:]]*origin ]]; then
      echo "ERROR ${file#"$root"/}:$lineno: tx.origin must not be used: $line"; status=1
    fi
  done < "$file"
done < <(find "$root"/packages/*/src "$root"/packages/*/contracts -type f -name '*.sol' \
  -not -path '*/test/*' -not -path '*/tests/*' -not -path '*/script/*' -not -path '*/scripts/*' \
  -not -path '*/node_modules/*' 2>/dev/null | LC_ALL=C sort)

if [ "$status" -eq 0 ]; then
  echo "OK: no tx.origin in $count Solidity source file(s)."
fi
exit "$status"
