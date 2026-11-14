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
# Allowlist: exact, publicly documented Anvil/Hardhat dev account keys only (never other values).
# Account 0 of the well-known "test test ... junk" mnemonic; funds on any real chain are long drained.
ALLOW_PUBLIC_DEV_KEYS='0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
PATTERNS='(PRIVATE KEY-----|0x[0-9a-fA-F]{64}\b.*(private|secret)|(private|secret|mnemonic).{0,40}0x[0-9a-fA-F]{64}|ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{60,}|\bsk-(proj-)?[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|xox[abprs]-[A-Za-z0-9-]{10,})'
hits="$(git grep -nIiE "$PATTERNS" -- . \
  ':!docs' ':!.github' ':!scripts/scan-secrets.sh' ':!**/test/**' ':!**/*.test.ts' ':!test-vectors' \
  ':!**/*.md' ':!packages/contracts/lib' || true)"
# Strip only the exact allowlisted substring, then re-match, so another secret on the same line still fails.
hits="$(printf '%s\n' "$hits" | sed "s/$ALLOW_PUBLIC_DEV_KEYS//g" | grep -iE "$PATTERNS" || true)"
if [ -n "$hits" ]; then
  printf '%s\n' "$hits"
  echo "ERROR: possible secret"; status=1
fi

if [ "$status" -eq 0 ]; then echo "OK: no committed env files or key material found."; fi
exit "$status"
