#!/usr/bin/env bash
# Checks that verifiers/*.sol equal `snarkjs zkey export solidityverifier` output for build/*_final.zkey,
# modulo the INSECURE DEV CEREMONY header and the contract rename; and that SHA256SUMS matches.
set -euo pipefail
PKG="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$PKG/../.." && pwd)"
SNARKJS="node $ROOT/node_modules/snarkjs/build/cli.cjs"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
cd "$PKG"
for pair in "withdraw32 WithdrawVerifier" "commitment RagequitVerifier"; do
  set -- $pair
  [ -f "build/$1_final.zkey" ] || { echo "missing build/$1_final.zkey: run npm run build:circuits" >&2; exit 1; }
  $SNARKJS zkey export solidityverifier "build/$1_final.zkey" "$TMP/$1.sol" >/dev/null
  sed "s/^contract Groth16Verifier {/contract $2 {/" "$TMP/$1.sol" > "$TMP/$1.renamed.sol"
  grep -v '^//' "verifiers/$2.sol" > "$TMP/$2.body"; grep -v '^//' "$TMP/$1.renamed.sol" > "$TMP/$1.body"
  diff -q "$TMP/$2.body" "$TMP/$1.body" >/dev/null || { echo "verifiers/$2.sol differs from snarkjs export" >&2; exit 1; }
  $SNARKJS zkey export verificationkey "build/$1_final.zkey" "$TMP/$1.vkey.json" >/dev/null
  cmp -s "$TMP/$1.vkey.json" "vkeys/$1.vkey.json" || { echo "vkeys/$1.vkey.json differs" >&2; exit 1; }
  echo "ok $2 == snarkjs export (body), vkey equal"
done
sha256sum -c SHA256SUMS
