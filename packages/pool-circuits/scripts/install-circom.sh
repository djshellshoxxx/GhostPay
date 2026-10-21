#!/usr/bin/env bash
# Installs the pinned circom v2.2.3 linux-amd64 release binary and refuses a SHA-256 mismatch.
# Usage: bash scripts/install-circom.sh [dest_dir]   (default: ./.tools)
set -euo pipefail
VERSION="v2.2.3"
SHA256="85342c7ff332d948df7c0c50ecf201e6129349aef550ce873f3c811b79fe53a3"  # verified 2026-10-21
DEST="${1:-$(cd "$(dirname "$0")/.." && pwd)/.tools}"
mkdir -p "$DEST"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
curl -sSfL -o "$TMP" "https://github.com/iden3/circom/releases/download/${VERSION}/circom-linux-amd64"
GOT="$(sha256sum "$TMP" | cut -d' ' -f1)"
if [ "$GOT" != "$SHA256" ]; then
  echo "circom sha256 mismatch: got $GOT want $SHA256" >&2
  exit 1
fi
install -m 0755 "$TMP" "$DEST/circom"
echo "installed $DEST/circom ($VERSION, sha256 ok)"
