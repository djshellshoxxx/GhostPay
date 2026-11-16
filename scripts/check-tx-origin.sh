#!/usr/bin/env bash
# Reject tx.origin in deployed Solidity sources, including tokens split by comments or newlines.
# Pure comments are ignored; mentions in strings or trailing comments still fail conservatively.
# Usage: scripts/check-tx-origin.sh [repo-root]
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="${1:-$(cd "$script_dir/.." && pwd)}"
exec node "$script_dir/check-tx-origin.mjs" "$root"
