#!/usr/bin/env bash
# Static guarantees of the production contracts (SP-CON-1, SP-GEN-2):
#  1. no admin/upgrade/fee vocabulary in src/ (generated verifiers excluded: they are snarkjs output);
#  2. no DELEGATECALL / SELFDESTRUCT / CALLCODE opcode in any deployed bytecode;
#  3. storage layout is exactly the expected set (no hidden owner/config slot; config is immutable).
# Usage: scripts/check-static.sh   (needs forge, cast, python3; FORGE=/CAST= to override)
set -euo pipefail
cd "$(dirname "$0")/.."
FORGE="${FORGE:-forge}"
CAST="${CAST:-cast}"
status=0

if grep -rnE --include='*.sol' -i 'delegatecall|selfdestruct|onlyOwner|Ownable|AccessControl|Initializable|UUPS|upgradeTo|FEE_RECIPIENT|setFee|pause' src --exclude-dir=verifiers \
  | grep -vE '^\S+:\s*[0-9]+:\s*///|//\s' ; then
  echo "[static] forbidden vocabulary found in src/"; status=1
else
  echo "[static] vocabulary: OK"
fi

"$FORGE" build >/dev/null
for c in GhostPayShieldedPoolERC20 GhostPayShieldedPoolNative GhostPayAssociationSetRegistry; do
  code=$("$FORGE" inspect "$c" deployedBytecode)
  if "$CAST" disassemble "$code" | grep -qE '\b(DELEGATECALL|SELFDESTRUCT|CALLCODE)\b'; then
    echo "[static] $c: forbidden opcode"; status=1
  else
    echo "[static] $c: opcodes OK"
  fi
done

check_layout() {
  local c="$1" expected="$2"
  got=$("$FORGE" inspect "$c" storageLayout --json | python3 -I -c 'import json,sys; print(",".join(s["label"] for s in json.load(sys.stdin)["storage"]))')
  if [[ "$got" != "$expected" ]]; then
    echo "[static] $c storage layout: got [$got], expected [$expected]"; status=1
  else
    echo "[static] $c storage layout: OK"
  fi
}
# _nameFallback/_versionFallback: OpenZeppelin EIP712 ShortStrings fallbacks (unused for short names).
check_layout GhostPayShieldedPoolERC20 "depositNonce,_tree,_rootSize,_spent,_depositors,_nameFallback,_versionFallback,_nonceBits"
check_layout GhostPayShieldedPoolNative "depositNonce,_tree,_rootSize,_spent,_depositors"
check_layout GhostPayAssociationSetRegistry "_latest,_supersededAt,_published"
exit $status
