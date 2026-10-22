#!/usr/bin/env bash
# Fails if any `uses:` in .github/ is not pinned to a full 40-hex commit SHA, or lacks a trailing
# version comment (`# vX.Y.Z`). Local actions (./path) are allowed. Commented-out lines are ignored.
# Usage: scripts/check-actions-pinned.sh [dir-containing-.github]   (default: repository root)
set -euo pipefail

root="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
status=0
count=0

while IFS= read -r file; do
  lineno=0
  while IFS= read -r line || [ -n "$line" ]; do
    lineno=$((lineno + 1))
    # Skip comment-only lines.
    if [[ "$line" =~ ^[[:space:]]*# ]]; then continue; fi
    if [[ "$line" =~ ^[[:space:]]*(-[[:space:]]+)?uses:[[:space:]]*([^[:space:]#]+)(.*)$ ]]; then
      ref="${BASH_REMATCH[2]}"
      rest="${BASH_REMATCH[3]}"
      ref="${ref%\"}"; ref="${ref#\"}"; ref="${ref%\'}"; ref="${ref#\'}"
      count=$((count + 1))
      if [[ "$ref" == ./* ]]; then continue; fi
      if [[ "$ref" == docker://* ]]; then
        if [[ ! "$ref" =~ @sha256:[0-9a-f]{64}$ ]]; then
          echo "ERROR $file:$lineno: docker action not pinned to a sha256 digest: $ref"; status=1
        fi
        continue
      fi
      if [[ ! "$ref" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_./-]+@[0-9a-f]{40}$ ]]; then
        echo "ERROR $file:$lineno: action is not pinned to a 40-hex commit SHA: $ref"; status=1
        continue
      fi
      if [[ ! "$rest" =~ \#[[:space:]]*v[0-9] ]]; then
        echo "ERROR $file:$lineno: pinned SHA has no '# vX.Y.Z' version comment: $ref"; status=1
      fi
    fi
  done < "$file"
done < <(find "$root/.github" -type f \( -name '*.yml' -o -name '*.yaml' \) | LC_ALL=C sort)

if [ "$status" -eq 0 ]; then
  echo "OK: $count 'uses:' reference(s) checked, all pinned to full SHAs with version comments."
fi
exit "$status"
