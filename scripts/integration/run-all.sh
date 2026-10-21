#!/usr/bin/env bash
# GhostPay full-stack integration run: brings up anvil + bitcoind (regtest) + solana-test-validator in Docker,
# runs the EVM, Bitcoin and Solana end-to-end suites in a Node 22 + Foundry runner container, collects logs, tears down.
# Works in a GitHub Codespace (.devcontainer, docker-in-docker) and on GitHub Actions ubuntu runners. DEV/TEST ONLY.
#
# Usage: bash scripts/integration/run-all.sh [command] [options]
#   all     (default) up -> test -> logs -> down. Exit status is that of the tests.
#   up      generate regtest credentials, build images, start the services, wait until all are healthy.
#   test    run the suites in the runner container against the services started by `up`.
#   logs    write service logs + container status to the log directory.
#   down    stop and remove containers, networks and tmpfs state (regtest chain and validator ledger are ephemeral).
# Options:
#   --suites evm,btc,solana   subset to run (default: all three)
#   --keep                    with `all`: leave the stack running afterwards (then use `down`)
# Env: INTEGRATION_LOG_DIR (default infra/integration/.state/logs), INTEGRATION_HOME (runner $HOME, default
#      ~/.cache/ghostpay-integration: caches the Solidity compiler and npm downloads between runs).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IT_DIR="$ROOT/infra/integration"
STATE_DIR="$IT_DIR/.state"
ENV_FILE="$STATE_DIR/env"
LOG_DIR="${INTEGRATION_LOG_DIR:-$STATE_DIR/logs}"
COMPOSE=(docker compose -f "$IT_DIR/docker-compose.yml")

cmd="all"; keep=0; suites="evm,btc,solana"
while [ $# -gt 0 ]; do
  case "$1" in
    all | up | test | logs | down) cmd="$1" ;;
    --keep) keep=1 ;;
    --suites) shift; suites="${1:?--suites needs a value}" ;;
    --suites=*) suites="${1#--suites=}" ;;
    -h | --help) sed -n '2,20p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown argument: $1 (try --help)" >&2; exit 2 ;;
  esac
  shift
done

log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 2; }

preflight() {
  command -v docker >/dev/null || die "docker not found. In a Codespace use the repo's devcontainer (docker-in-docker)."
  docker compose version >/dev/null 2>&1 || die "'docker compose' (v2) not available"
  docker info >/dev/null 2>&1 || die "cannot reach the Docker daemon (is docker-in-docker up? try: docker info)"
}

# Exports compose interpolation variables. On `up` fresh regtest credentials are generated and saved (mode 600) so
# later invocations (test/logs/down, possibly separate CI steps) use the same ones. Nothing here is committed.
load_env() { # generate=1|0
  mkdir -p "$STATE_DIR"
  umask 077
  if [ "$1" = "1" ]; then
    local user pass salt hmac
    command -v openssl >/dev/null || die "openssl is needed to generate the regtest RPC credentials"
    user="ghostpay-it"
    pass="$(openssl rand -hex 24)"
    salt="$(openssl rand -hex 16)"
    # bitcoind -rpcauth=<user>:<salt>$<hmac-sha256(key=salt, msg=password)>  (same scheme as share/rpcauth/rpcauth.py)
    hmac="$(printf '%s' "$pass" | openssl dgst -sha256 -hmac "$salt" -r | cut -d' ' -f1)"
    {
      printf "export BITCOIND_RPC_USER='%s'\n" "$user"
      printf "export BITCOIND_RPC_PASSWORD='%s'\n" "$pass"
      printf "export BITCOIND_RPCAUTH='%s:%s\$%s'\n" "$user" "$salt" "$hmac"
    } >"$ENV_FILE"
  fi
  if [ -f "$ENV_FILE" ]; then
    # shellcheck disable=SC1090
    . "$ENV_FILE"
  else
    # No stack was started by this checkout: placeholders only so `down`/`logs` can interpolate the compose file.
    export BITCOIND_RPC_USER=unused BITCOIND_RPC_PASSWORD=unused BITCOIND_RPCAUTH=unused
  fi
  export RUNNER_UID="${RUNNER_UID:-$(id -u)}" RUNNER_GID="${RUNNER_GID:-$(id -g)}"
  export INTEGRATION_HOME="${INTEGRATION_HOME:-${XDG_CACHE_HOME:-$HOME/.cache}/ghostpay-integration}"
  mkdir -p "$INTEGRATION_HOME"
  export INTEGRATION_SUITES="$suites"
}

# retry <attempts> <command...>: registries rate-limit and flake; a real build/start error fails 3 times in a row.
retry() {
  local n="$1" i; shift
  for i in $(seq 1 "$n"); do
    "$@" && return 0
    [ "$i" -lt "$n" ] && { log "attempt $i/$n failed: $*; retrying in 15s"; sleep 15; }
  done
  return 1
}

do_up() {
  preflight
  load_env 0
  "${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true # fresh chains every run (old creds, if any)
  load_env 1
  log "building images (runner, solana-test-validator) ..."
  retry 3 "${COMPOSE[@]}" build
  log "starting anvil, bitcoind, solana and waiting for health (first start pulls images) ..."
  retry 2 "${COMPOSE[@]}" up -d --wait --wait-timeout 600 anvil bitcoind solana
  "${COMPOSE[@]}" ps
}

do_test() {
  preflight
  load_env 0
  [ -f "$ENV_FILE" ] || die "no running stack found; run '$0 up' first"
  log "running suites: $suites"
  "${COMPOSE[@]}" run --rm --no-deps runner
}

do_logs() {
  preflight
  load_env 0
  mkdir -p "$LOG_DIR"
  "${COMPOSE[@]}" ps -a >"$LOG_DIR/ps.txt" 2>&1 || true
  local svc pass="${BITCOIND_RPC_PASSWORD:-unused}"
  for svc in anvil bitcoind solana runner; do
    # Defence in depth: the generated regtest password should never be in a log, but scrub it if it is.
    "${COMPOSE[@]}" logs --no-color --timestamps "$svc" 2>&1 | sed "s/${pass//\//\\/}/<redacted>/g" >"$LOG_DIR/$svc.log" || true
  done
  # Local logs written by scripts/devnet (anvil is compose's, but up.sh/e2e keep their own state dir).
  if [ -d "$ROOT/scripts/devnet/.state" ]; then
    mkdir -p "$LOG_DIR/devnet-state"
    find "$ROOT/scripts/devnet/.state" -maxdepth 1 -name '*.log' -exec cp {} "$LOG_DIR/devnet-state/" \; 2>/dev/null || true
  fi
  log "logs written to $LOG_DIR"
}

do_down() {
  preflight
  load_env 0
  "${COMPOSE[@]}" down -v --remove-orphans
  rm -f "$ENV_FILE"
  log "stack removed"
}

case "$cmd" in
  up) do_up ;;
  test) do_test ;;
  logs) do_logs ;;
  down) do_down ;;
  all)
    rc=0
    do_up || rc=$?
    if [ "$rc" -eq 0 ]; then do_test || rc=$?; fi
    do_logs || true
    if [ "$keep" -eq 1 ]; then
      log "--keep: stack left running (bash scripts/integration/run-all.sh down to remove it)"
    else
      do_down || true
    fi
    if [ "$rc" -eq 0 ]; then log "ALL INTEGRATION SUITES PASSED"; else log "INTEGRATION RUN FAILED (exit $rc)"; fi
    exit "$rc"
    ;;
esac
