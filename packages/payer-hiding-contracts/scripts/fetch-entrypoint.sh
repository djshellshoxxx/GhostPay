#!/usr/bin/env bash
# Fetch the ERC-4337 EntryPoint v0.7.0 source for TESTS ONLY into .vendor/ (gitignored, never committed).
# Source: npm package @account-abstraction/contracts@0.7.0 (eth-infinitism/account-abstraction release v0.7.0).
# The package.json says MIT but core/*.sol carry `SPDX-License-Identifier: GPL-3.0`: do not copy into the repo.
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=0.7.0
DEST=.vendor/account-abstraction
if [ -f "$DEST/core/EntryPoint.sol" ]; then echo "already present: $DEST"; exit 0; fi
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
( cd "$TMP" && npm pack "@account-abstraction/contracts@${VERSION}" --silent >/dev/null && tar xzf ./*.tgz )
mkdir -p "$DEST"
cp -r "$TMP/package/core" "$TMP/package/interfaces" "$TMP/package/utils" "$DEST/"
echo "fetched @account-abstraction/contracts@${VERSION} into $DEST"
