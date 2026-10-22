#!/usr/bin/env bash
# Committed-secret checks (factored out of .github/workflows/ci.yml). Run from anywhere inside the repo.
# Usage: scripts/scan-secrets.sh
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
status=0

# 1. No env files other than *.env.example.
if git ls-files | grep -E '(^|/)\.env($|\.)' | grep -v '\.env\.example$'; then
  echo "ERROR: env file committed"; status=1
fi

# 2. No private-key material. The pathspec excludes docs, tests, vectors and vendored libs, and this
#    script plus the workflows (which necessarily contain the pattern text).
if git grep -nE '(PRIVATE KEY-----|0x[0-9a-fA-F]{64}\b.*(private|secret))' -- . \
  ':!docs' ':!.github' ':!scripts/scan-secrets.sh' ':!**/test/**' ':!**/*.test.ts' ':!test-vectors' \
  ':!**/*.md' ':!packages/contracts/lib'; then
  echo "ERROR: possible secret"; status=1
fi

if [ "$status" -eq 0 ]; then echo "OK: no committed env files or key material found."; fi
exit "$status"
