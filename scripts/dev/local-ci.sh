#!/usr/bin/env bash
# Local mirror of the CI gates, one step at a time, with a PASS/FAIL line and a log file per step.
#
# Purpose: check a branch (or an integration of several branches) the way CI does before pushing, and keep each
# step's full output for diagnosis. Written by Claude Code (AI agent) for GhostPay, 2026-10-29; same licence as the
# repository. See scripts/dev/README.md for the known slow and flaky steps in small containers.
#
# Usage: scripts/dev/local-ci.sh [--log DIR] [--only a,b,...] [--skip a,b,...] [--web-tests "file ..."] [--list]
#   --log DIR        where step logs go (default: a new directory under ${TMPDIR:-/tmp})
#   --only/--skip    comma-separated step names (see --list); pkg-<workspace> names one package's tests
#   --web-tests      run only these apps/web test files (paths relative to apps/web), without coverage, as step web-tests
# Exit status: 0 when every selected step passed, 1 otherwise, 2 on bad arguments.
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "run inside the repository" >&2; exit 2; }
cd "$ROOT" || exit 2

PACKAGES=(core-crypto invoice-schema payment-uri chain-adapters sdk cli merchant-hooks merchant-ledger relayer-guard
  relayer pool-relayer solana-stealth tron-adapter btc-silent-payments)
STEPS=(build-libs typecheck lint)
for p in "${PACKAGES[@]}"; do STEPS+=("pkg-$p"); done
STEPS+=(scan-secrets check-headers deploy-selftest scripts-tests php kit web-build web-coverage web-nocov)

log=""; only=""; skip=""; web_tests=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --log) log="${2:?--log needs a directory}"; shift 2 ;;
    --only) only="${2:?--only needs step names}"; shift 2 ;;
    --skip) skip="${2:?--skip needs step names}"; shift 2 ;;
    --web-tests) web_tests="${2:?--web-tests needs file names}"; shift 2 ;;
    --list) printf '%s\n' "${STEPS[@]}" web-tests; exit 0 ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
[[ -n "$log" ]] || log="$(mktemp -d "${TMPDIR:-/tmp}/ghostpay-local-ci.XXXXXX")"
mkdir -p "$log" || exit 2
[[ -n "$web_tests" ]] && STEPS+=(web-tests)

selected() {
  local name="$1"
  if [[ -n "$only" ]]; then [[ ",$only," == *",$name,"* ]] || return 1; fi
  if [[ -n "$skip" ]]; then [[ ",$skip," == *",$name,"* ]] && return 1; fi
  if [[ "$name" = web-tests ]] && [[ -z "$web_tests" ]]; then return 1; fi
  return 0
}

run_step() {
  local name="$1"
  case "$name" in
    build-libs) npm run build:libs ;;
    typecheck) npm run typecheck ;;
    lint) npm run lint ;;
    pkg-*) npm test -w "@ghostpay/${name#pkg-}" ;;
    scan-secrets) bash scripts/scan-secrets.sh ;;
    check-headers) bash infra/proxy/check-headers.sh ;;
    deploy-selftest) bash deploy/selftest.sh ;;
    # scripts/testnet needs Foundry's cast; CI installs it, so it runs only when cast is on PATH.
    scripts-tests)
      if command -v cast >/dev/null; then node --test scripts/testnet/*.test.mjs scripts/regtest/*.test.mjs scripts/tests/*.test.mjs
      else echo "cast not found: skipping scripts/testnet"; node --test scripts/regtest/*.test.mjs scripts/tests/*.test.mjs; fi ;;
    php) php integrations/woocommerce/tests/run.php && php integrations/prestashop/tests/run.php ;;
    kit) (cd tools/portable-hosting-kit && npm test) ;;
    web-build) npm run build -w @ghostpay/web ;;
    # --coverage.reportOnFailure: vitest otherwise prints no coverage summary when any test fails.
    web-coverage) (cd apps/web && ../../node_modules/.bin/vitest run --coverage --coverage.reportOnFailure --maxWorkers=2) ;;
    web-nocov) (cd apps/web && ../../node_modules/.bin/vitest run --config vitest.nocov.config.ts) ;;
    # Word splitting of the file list is intended.
    # shellcheck disable=SC2086
    web-tests) (cd apps/web && ../../node_modules/.bin/vitest run $web_tests --coverage.enabled=false --maxWorkers=2) ;;
    *) echo "unknown step $name" >&2; return 2 ;;
  esac
}

fail=0
for name in "${STEPS[@]}"; do
  selected "$name" || continue
  t0=$SECONDS
  if run_step "$name" >"$log/$name.log" 2>&1; then
    echo "PASS $name ($((SECONDS - t0))s)"
  else
    echo "FAIL $name ($((SECONDS - t0))s) see $log/$name.log"
    fail=1
  fi
done
echo "DONE fail=$fail logs=$log"
exit "$fail"
