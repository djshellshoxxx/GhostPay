#!/usr/bin/env bash
# Compile both circuits, then run the INSECURE DEV CEREMONY and export keys + Solidity verifiers.
# Requires circom 2.2.3 on PATH (or CIRCOM=/path) and `npm install` at the repo root (snarkjs, circomlib).
set -euo pipefail
PKG="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$PKG/../.." && pwd)"
CIRCOM="${CIRCOM:-circom}"
WANT_SHA="85342c7ff332d948df7c0c50ecf201e6129349aef550ce873f3c811b79fe53a3"
CIRCOM_PATH="$(command -v "$CIRCOM")" || { echo "circom not found (bash scripts/install-circom.sh)" >&2; exit 1; }
GOT_SHA="$(sha256sum "$CIRCOM_PATH" | cut -d' ' -f1)"
if [ "$GOT_SHA" != "$WANT_SHA" ]; then
  echo "circom binary sha256 $GOT_SHA != pinned v2.2.3 linux-amd64 $WANT_SHA" >&2
  exit 1
fi
"$CIRCOM" --version | grep -q "2.2.3" || { echo "need circom 2.2.3" >&2; exit 1; }

mkdir -p "$PKG/build"
cd "$PKG"
for c in withdraw32 commitment; do
  "$CIRCOM" "circuits/main/$c.circom" --r1cs --wasm --sym -l "$ROOT/node_modules" --O2 --sanity_check -o build \
    | tee "build/$c.compile.txt"
done
bash "$PKG/scripts/ceremony-dev.sh"
