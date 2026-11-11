#!/usr/bin/env bash
# GhostPay core functional-beta acceptance: ONE command that exercises the seller -> buyer -> seller lifecycle on a
# local anvil devnet with real contracts and real transactions. LOCAL/TEST ONLY: public anvil dev keys, no real funds,
# no public network. Stages (each must pass; none is silently skipped):
#   lib      scripts/devnet/e2e.mjs            library lifecycle: keygen, invoice, pay (ETH/ERC-20/permit), scan,
#                                              receipt, direct + relayer sweep, backup/restore rescan (chain 31337)
#   cli      scripts/beta/cli-devnet.e2e.mjs   the CLI against the same devnet (chain 31337)
#   browser  scripts/beta/browser-devnet.sh    the BUILT web app in Chromium against its own anvil (chain 84532 alias)
#
# Usage: bash scripts/beta/acceptance.sh [--stages lib,cli,browser] [--skip-build]
# Needs: node >= 22, npm ci done, foundry (anvil/forge/cast) on PATH or in ~/.foundry/bin, solc 0.8.28 available to
# forge, and the pre-installed Chromium for the browser stage. Exit status is non-zero if any selected stage fails.
# Writes a source-pinned summary to scripts/beta/.state/acceptance-<UTC>.log (gitignored state directory).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STATE="$ROOT/scripts/beta/.state"
export PATH="$PATH:$HOME/.foundry/bin"

stages="lib,cli,browser"
build=1
while [ $# -gt 0 ]; do
  case "$1" in
    --stages) shift; stages="${1:?--stages needs a value}" ;;
    --stages=*) stages="${1#--stages=}" ;;
    --skip-build) build=0 ;;
    -h | --help) sed -n '2,16p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown argument: $1 (try --help)" >&2; exit 2 ;;
  esac
  shift
done
IFS=',' read -r -a want <<<"$stages"
for s in "${want[@]}"; do
  case "$s" in lib | cli | browser) ;; *) echo "unknown stage: $s" >&2; exit 2 ;; esac
done
has() { local s; for s in "${want[@]}"; do [ "$s" = "$1" ] && return 0; done; return 1; }

die() { printf 'ACCEPTANCE ERROR: %s\n' "$*" >&2; exit 2; }
command -v node >/dev/null || die "node not found"
[ "$(node -p 'Number(process.versions.node.split(".")[0])')" -ge 22 ] || die "node >= 22 required"
for t in anvil forge cast; do command -v "$t" >/dev/null || die "$t not found (install the pinned Foundry, see .github/actions/setup-forge)"; done
[ -d "$ROOT/node_modules" ] || die "run 'npm ci --ignore-scripts' first"

mkdir -p "$STATE"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
LOG="$STATE/acceptance-$stamp.log"
head_sha="$(git -C "$ROOT" rev-parse HEAD)"
dirty="$(git -C "$ROOT" status --porcelain --untracked-files=no | grep -v ' deployments/31337.json$' || true)"
{
  echo "GhostPay core beta acceptance $stamp"
  echo "commit $head_sha${dirty:+ (tracked changes present)}"
  echo "node $(node -v); $(anvil --version | head -1); $(forge --version | head -1)"
  echo "stages $stages"
} | tee "$LOG"

started_devnet=0
cleanup() {
  if [ "$started_devnet" = "1" ]; then bash "$ROOT/scripts/devnet/down.sh" >/dev/null 2>&1 || true; fi
  # up.sh rewrites the tracked devnet manifest (date/commit); restore it so acceptance leaves the tree unchanged.
  git -C "$ROOT" checkout -- deployments/31337.json 2>/dev/null || true
}
trap cleanup EXIT

if [ "$build" = "1" ]; then
  echo "== build libraries and CLI" | tee -a "$LOG"
  (cd "$ROOT" && npm run build:libs >"$STATE/build-$stamp.log" 2>&1) || die "build:libs failed (see $STATE/build-$stamp.log)"
  if [ -f "$ROOT/packages/cli/package.json" ]; then
    (cd "$ROOT" && npm run build -w @ghostpay/cli >>"$STATE/build-$stamp.log" 2>&1) || die "CLI build failed"
  fi
  if has lib; then
    (cd "$ROOT" && npm run build -w apps/relayer >>"$STATE/build-$stamp.log" 2>&1) || die "relayer build failed"
  fi
fi

results=()
fail=0
run_stage() { # name, command...
  local name="$1"; shift
  local t0 t1 rc
  echo "== stage $name" | tee -a "$LOG"
  t0="$(date +%s)"
  set +e
  "$@" 2>&1 | tee -a "$LOG"
  rc="${PIPESTATUS[0]}"
  set -e
  t1="$(date +%s)"
  if [ "$rc" = "0" ]; then results+=("PASS $name ($((t1 - t0))s)"); else results+=("FAIL $name exit=$rc ($((t1 - t0))s)"); fail=1; fi
}

if has lib || has cli; then
  # Fresh 31337 devnet owned by this run (refuse to reuse someone else's chain: counts in the lib stage assume it).
  if bash -c "source '$ROOT/scripts/devnet/lib.sh'; anvil_alive"; then
    die "an anvil already answers on the devnet port; stop it (scripts/devnet/down.sh) or set DEVNET_PORT"
  fi
  started_devnet=1
  bash "$ROOT/scripts/devnet/up.sh" >>"$LOG" 2>&1 || die "devnet up failed (see $LOG)"
fi
has lib && run_stage lib node "$ROOT/scripts/devnet/e2e.mjs"
has cli && run_stage cli node "$ROOT/scripts/beta/cli-devnet.e2e.mjs"
has browser && run_stage browser bash "$ROOT/scripts/beta/browser-devnet.sh"

{
  echo "== summary (commit $head_sha)"
  printf '%s\n' "${results[@]}"
  [ "$fail" = "0" ] && echo "ACCEPTANCE OK" || echo "ACCEPTANCE FAILED"
  echo "log: $LOG"
} | tee -a "$LOG"
exit "$fail"
