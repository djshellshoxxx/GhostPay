#!/usr/bin/env bash
# Prints the effective deployment configuration WITHOUT broadcasting anything and applies the same
# static checks as the forge scripts. Read-only chain queries (cast call / code) run only when RPC_URL
# is set. Never reads or needs a private key.
#
# Usage:  scripts/pre-deploy-check.sh router|policy
#   router: FEE_RECIPIENT [ANNOUNCER] [ALLOW_CUSTOM_ANNOUNCER=1] [EXPECTED_ANNOUNCER_CODEHASH]
#   policy: FEE_RECIPIENT FEE_TOKEN FLAT_FEE MAX_FLAT_FEE
#   both:   [ALLOWED_CHAIN_IDS=1,8453] [ALLOW_LOCAL=1] [RPC_URL] [SENDER=<broadcaster address>]
#   DRY_RUN=1 additionally runs `forge script` WITHOUT --broadcast (needs RPC_URL).
# Exit status 0 = all checks passed, 1 = at least one check failed.
set -uo pipefail
cd "$(dirname "$0")/.."

CANONICAL_ANNOUNCER=0x55649E01B5Df198D18D95b5cc5051630cfD45564
TESTNETS=(11155111 84532 11155420 421614 80002 560048)
mode="${1:-}"
fail=0
bad() { echo "FAIL  $*"; fail=1; }
ok()  { echo "ok    $*"; }
warn() { echo "WARN  $*"; }
lower() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }
is_addr() { [[ "${1:-}" =~ ^0x[0-9a-fA-F]{40}$ ]]; }
is_zero() { [[ "$(lower "${1:-}")" == "0x0000000000000000000000000000000000000000" ]]; }

case "$mode" in router|policy) ;; *) echo "usage: $0 router|policy" >&2; exit 2 ;; esac

echo "== effective configuration ($mode) =="
echo "RPC_URL                    : $([[ -n "${RPC_URL:-}" ]] && echo '<set, hidden>' || echo '<unset>')"
echo "SENDER                     : ${SENDER:-<unset>}"
echo "FEE_RECIPIENT              : ${FEE_RECIPIENT:-<unset>}"
echo "ALLOWED_CHAIN_IDS          : ${ALLOWED_CHAIN_IDS:-<unset>}"
echo "ALLOW_LOCAL                : ${ALLOW_LOCAL:-<unset>}"
if [[ "$mode" == router ]]; then
  echo "ANNOUNCER (effective)      : ${ANNOUNCER:-$CANONICAL_ANNOUNCER}${ANNOUNCER:+ (from env)}"
  echo "ALLOW_CUSTOM_ANNOUNCER     : ${ALLOW_CUSTOM_ANNOUNCER:-<unset>}"
  echo "EXPECTED_ANNOUNCER_CODEHASH: ${EXPECTED_ANNOUNCER_CODEHASH:-<unset>}"
else
  echo "FEE_TOKEN                  : ${FEE_TOKEN:-<unset>}"
  echo "FLAT_FEE                   : ${FLAT_FEE:-<unset>}"
  echo "MAX_FLAT_FEE               : ${MAX_FLAT_FEE:-<unset>}"
fi
echo

echo "== static checks =="
if [[ -z "${FEE_RECIPIENT:-}" ]] || is_zero "$FEE_RECIPIENT"; then bad "FEE_RECIPIENT unset or zero"
elif ! is_addr "$FEE_RECIPIENT"; then bad "FEE_RECIPIENT is not an address"
else ok "FEE_RECIPIENT is a non-zero address"; fi
if [[ -n "${SENDER:-}" && -n "${FEE_RECIPIENT:-}" && "$(lower "$SENDER")" == "$(lower "$FEE_RECIPIENT")" ]]; then
  bad "FEE_RECIPIENT equals the broadcaster (SENDER)"
elif [[ -z "${SENDER:-}" ]]; then warn "SENDER not given: cannot check FEE_RECIPIENT != broadcaster (the script re-checks at run time)"; fi

# Allowlist: strict parse like the forge script (spaces/tabs trimmed, digits only).
allowed_extra=()
if [[ -n "${ALLOWED_CHAIN_IDS:-}" ]]; then
  [[ "$ALLOWED_CHAIN_IDS" =~ (^|,)[[:space:]]*(,|$) ]] && bad "ALLOWED_CHAIN_IDS contains an empty entry"
  IFS=',' read -r -a parts <<<"$ALLOWED_CHAIN_IDS"
  for p in "${parts[@]}"; do
    t="${p#"${p%%[![:space:]]*}"}"; t="${t%"${t##*[![:space:]]}"}"
    if [[ "$t" =~ ^[0-9]+$ ]]; then allowed_extra+=("$t"); else bad "ALLOWED_CHAIN_IDS entry '$p' is not a decimal number"; fi
  done
fi
[[ "${ALLOW_LOCAL:-}" == 1 ]] && warn "ALLOW_LOCAL=1: chain id 31337 will be accepted"

if [[ "$mode" == router ]]; then
  eff="${ANNOUNCER:-$CANONICAL_ANNOUNCER}"
  if ! is_addr "$eff"; then bad "ANNOUNCER is not an address"
  elif [[ "$(lower "$eff")" != "$(lower "$CANONICAL_ANNOUNCER")" ]]; then
    if [[ "${ALLOW_CUSTOM_ANNOUNCER:-}" == 1 ]]; then warn "custom announcer $eff allowed by ALLOW_CUSTOM_ANNOUNCER=1 (testnets only)"
    else bad "ANNOUNCER differs from the canonical announcer and ALLOW_CUSTOM_ANNOUNCER=1 is not set"; fi
  else ok "announcer is the canonical one"; fi
else
  if [[ -z "${FEE_TOKEN:-}" ]] || is_zero "$FEE_TOKEN" || ! is_addr "$FEE_TOKEN"; then bad "FEE_TOKEN unset, zero or not an address"; else ok "FEE_TOKEN is a non-zero address"; fi
  [[ "${FLAT_FEE:-}" =~ ^[0-9]+$ ]] || bad "FLAT_FEE unset or not a decimal integer"
  [[ "${MAX_FLAT_FEE:-}" =~ ^[0-9]+$ ]] || bad "MAX_FLAT_FEE unset or not a decimal integer (required, no default)"
  if [[ "${FLAT_FEE:-}" =~ ^[0-9]+$ && "${MAX_FLAT_FEE:-}" =~ ^[0-9]+$ ]]; then
    # Compare as decimal strings (values may exceed 64 bits): strip leading zeros, then length, then lexicographic.
    f="${FLAT_FEE#"${FLAT_FEE%%[!0]*}"}"; m="${MAX_FLAT_FEE#"${MAX_FLAT_FEE%%[!0]*}"}"
    if (( ${#f} > ${#m} )) || { (( ${#f} == ${#m} )) && [[ "$f" > "$m" ]]; }; then
      bad "FLAT_FEE ($FLAT_FEE) exceeds MAX_FLAT_FEE ($MAX_FLAT_FEE)"
    else ok "FLAT_FEE <= MAX_FLAT_FEE"; fi
  fi
fi

if [[ -n "${RPC_URL:-}" ]]; then
  if ! command -v cast >/dev/null; then warn "cast not found: skipping chain queries"
  else
    echo
    echo "== chain queries (read-only) =="
    chain=$(cast chain-id --rpc-url "$RPC_URL" 2>/dev/null || true)
    if [[ -z "$chain" ]]; then bad "cannot read chain id from RPC_URL"
    else
      echo "chainId                    : $chain"
      allowed=0
      for c in "${TESTNETS[@]}" "${allowed_extra[@]:-}"; do [[ "$c" == "$chain" ]] && allowed=1; done
      [[ "$chain" == 31337 && "${ALLOW_LOCAL:-}" == 1 ]] && allowed=1
      (( allowed )) && ok "chain $chain is allowed" || bad "chain $chain is not a built-in testnet nor listed in ALLOWED_CHAIN_IDS"
    fi
    if [[ -n "${FEE_RECIPIENT:-}" ]] && is_addr "$FEE_RECIPIENT"; then
      len=$(cast code "$FEE_RECIPIENT" --rpc-url "$RPC_URL" 2>/dev/null | wc -c)
      (( len > 3 )) && warn "FEE_RECIPIENT has code: it must accept plain ETH / the fee token and not be blacklistable" || ok "FEE_RECIPIENT is an EOA"
    fi
    if [[ "$mode" == router ]]; then
      eff="${ANNOUNCER:-$CANONICAL_ANNOUNCER}"
      code=$(cast code "$eff" --rpc-url "$RPC_URL" 2>/dev/null || true)
      if [[ ${#code} -le 3 ]]; then bad "announcer $eff has no code on this chain"
      else
        h=$(cast keccak "$code" 2>/dev/null || true)
        echo "announcer codehash         : $h"
        if [[ -n "${EXPECTED_ANNOUNCER_CODEHASH:-}" && "$(lower "$h")" != "$(lower "$EXPECTED_ANNOUNCER_CODEHASH")" ]]; then bad "announcer codehash differs from EXPECTED_ANNOUNCER_CODEHASH"; else ok "announcer has code"; fi
      fi
    else
      if [[ -n "${FEE_TOKEN:-}" ]] && is_addr "$FEE_TOKEN"; then
        code=$(cast code "$FEE_TOKEN" --rpc-url "$RPC_URL" 2>/dev/null || true)
        if [[ ${#code} -le 3 ]]; then bad "FEE_TOKEN has no code on this chain"
        else
          dec=$(cast call "$FEE_TOKEN" "decimals()(uint8)" --rpc-url "$RPC_URL" 2>/dev/null || true)
          sym=$(cast call "$FEE_TOKEN" "symbol()(string)" --rpc-url "$RPC_URL" 2>/dev/null || true)
          echo "FEE_TOKEN symbol/decimals  : ${sym:-?} / ${dec:-?}"
          [[ -z "$dec" ]] && warn "decimals() unavailable: check FLAT_FEE manually"
          [[ -n "$dec" && "${FLAT_FEE:-}" =~ ^[0-9]+$ ]] && echo "FLAT_FEE in whole tokens   : $(cast format-units "$FLAT_FEE" "$dec" 2>/dev/null)"
        fi
      fi
    fi
  fi
else
  warn "RPC_URL not set: chain id, code and decimals checks skipped"
fi

if [[ "${DRY_RUN:-}" == 1 ]]; then
  echo
  echo "== forge script dry run (no --broadcast) =="
  [[ -n "${RPC_URL:-}" ]] || { bad "DRY_RUN=1 needs RPC_URL"; }
  if (( fail == 0 )); then
    target=script/Deploy.s.sol; [[ "$mode" == policy ]] && target=script/DeployPolicy.s.sol
    forge script "$target" --rpc-url "$RPC_URL" ${SENDER:+--sender "$SENDER"} || fail=1
  fi
fi

echo
if (( fail )); then echo "RESULT: FAILED (nothing was broadcast)"; exit 1; fi
echo "RESULT: all checks passed (nothing was broadcast)"
