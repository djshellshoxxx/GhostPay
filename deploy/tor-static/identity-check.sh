#!/bin/sh
# Tor itself loads/validates its split ed25519 keys and derives their hostname.
# Never parse private-key bytes, invent crypto, or let Tor repair the live copy.
# See README.md for the primary Tor source references and offline-test boundary.

check_tor_identity() (
  set -eu
  umask 077
  if [ "$#" -ne 4 ]; then
    printf '%s\n' 'Identity check arguments are missing.' >&2
    exit 1
  fi
  identity_mode=$1
  identity_data=$2
  identity_pin=$3
  identity_tor=$4
  case "$identity_mode" in verify|initialize) ;; *) exit 1 ;; esac

  identity_fail() { printf '%s\n' "$1" >&2; exit 1; }
  identity_private_dir() {
    [ -d "$1" ] && [ ! -L "$1" ] && [ "$(stat -c '%a' "$1")" = 700 ] \
      && [ "$(stat -c '%u' "$1")" = "$(id -u)" ]
  }
  identity_private_file() {
    [ -f "$1" ] && [ ! -L "$1" ] && [ "$(stat -c '%a' "$1")" = 600 ] \
      && [ "$(stat -c '%u' "$1")" = "$(id -u)" ] && [ "$(stat -c '%h' "$1")" = 1 ]
  }
  identity_hostname() {
    [ -f "$1" ] && [ ! -L "$1" ] && [ "$(wc -c < "$1")" -eq 63 ] \
      && LC_ALL=C grep -Eq '^[a-z2-7]{56}\.onion$' "$1"
  }

  identity_private_dir "$identity_data" || identity_fail 'Tor requires a private identity data directory owned by its runtime user.'
  [ -f "$identity_pin" ] && [ ! -L "$identity_pin" ] || identity_fail 'The configured onion hostname file is missing or invalid.'
  identity_service=$identity_data/ghostpay
  if [ "$identity_mode" = verify ]; then
    identity_hostname "$identity_pin" || identity_fail 'A configured onion hostname is required; initialize explicitly, then prepare with its publicOrigin.'
    identity_private_dir "$identity_service" || identity_fail 'The stored onion identity is missing or not private; restore it before startup.'
    for identity_name in hostname hs_ed25519_secret_key hs_ed25519_public_key; do
      identity_private_file "$identity_service/$identity_name" || identity_fail 'The stored onion identity must contain private regular files; refusing a partial or unsafe restore.'
    done
    identity_hostname "$identity_service/hostname" || identity_fail 'The stored onion identity hostname is malformed.'
    cmp -s "$identity_pin" "$identity_service/hostname" || identity_fail 'The stored onion identity does not match the configured onion hostname.'
  else
    [ ! -s "$identity_pin" ] || identity_fail 'Initialization requires an empty first-use origin; restore the existing identity for a configured origin.'
    [ ! -e "$identity_service" ] && [ ! -L "$identity_service" ] || identity_fail 'An onion identity directory already exists; initialization never replaces it.'
  fi

  identity_lock=$identity_data/.ghostpay-identity-lock
  mkdir -m 700 "$identity_lock" 2>/dev/null || identity_fail 'Another identity operation is in progress; inspect its private lock before retrying.'
  identity_tmp=
  identity_pid=
  identity_stage=
  identity_cleanup() {
    if [ -n "$identity_pid" ]; then
      kill -TERM "$identity_pid" 2>/dev/null || :
      wait "$identity_pid" 2>/dev/null || :
    fi
    [ -z "$identity_tmp" ] || rm -rf -- "$identity_tmp"
    [ -z "$identity_stage" ] || rm -rf -- "$identity_stage"
    rmdir "$identity_lock" 2>/dev/null || :
  }
  trap identity_cleanup EXIT
  trap 'exit 1' HUP INT TERM
  identity_tmp=$(mktemp -d /tmp/ghostpay-identity.XXXXXXXX)
  mkdir -m 700 "$identity_tmp/data" "$identity_tmp/service"
  if [ "$identity_mode" = verify ]; then
    for identity_name in hs_ed25519_secret_key hs_ed25519_public_key; do
      cp -- "$identity_service/$identity_name" "$identity_tmp/service/$identity_name"
      chmod 600 "$identity_tmp/service/$identity_name"
    done
  fi
  # DisableNetwork alone may still permit configuration-time DNS lookups. This
  # isolated torrc uses only a numeric loopback target, no configured web hostname,
  # no listeners, no control endpoint, and no persisted Tor network state.
  cat > "$identity_tmp/torrc" <<EOF
DataDirectory $identity_tmp/data
SocksPort 0
ControlPort 0
ORPort 0
DirPort 0
DNSPort 0
TransPort 0
ClientOnly 1
DisableNetwork 1
RunAsDaemon 0
SafeLogging 1
Log notice stderr
HiddenServiceDir $identity_tmp/service
HiddenServiceVersion 3
HiddenServicePort 80 127.0.0.1:9
EOF
  "$identity_tor" --defaults-torrc /dev/null -f "$identity_tmp/torrc" > "$identity_tmp/process.log" 2>&1 &
  identity_pid=$!
  identity_wait=0
  # Tor writes the hostname during configuration, before its main loop installs
  # signal handlers. Its fixed 0% startup notice follows handle_signals(); wait
  # for that private-log marker as well, so SIGTERM cannot race handler setup.
  # This is startup readiness only, with DisableNetwork still set to 1.
  while ! identity_hostname "$identity_tmp/service/hostname" \
      || ! LC_ALL=C grep -Eq '\[notice\] Bootstrapped 0% \(starting\): Starting$' "$identity_tmp/process.log"; do
    kill -0 "$identity_pid" 2>/dev/null || identity_fail 'Offline Tor could not validate the onion identity; no stored keys were replaced.'
    identity_wait=$((identity_wait + 1))
    [ "$identity_wait" -lt 150 ] || identity_fail 'Offline Tor identity validation timed out; no stored keys were replaced.'
    sleep 0.1
  done
  kill -TERM "$identity_pid" 2>/dev/null || identity_fail 'Offline Tor stopped before identity validation completed.'
  if wait "$identity_pid"; then identity_pid=; else identity_fail 'Offline Tor rejected the onion identity; no stored keys were replaced.'; fi
  for identity_name in hostname hs_ed25519_secret_key hs_ed25519_public_key; do
    identity_private_file "$identity_tmp/service/$identity_name" || identity_fail 'Offline Tor did not create a complete private onion identity.'
  done

  if [ "$identity_mode" = verify ]; then
    cmp -s "$identity_pin" "$identity_tmp/service/hostname" || identity_fail 'The derived onion hostname does not match the configured origin; restore the correct identity.'
    for identity_name in hs_ed25519_secret_key hs_ed25519_public_key; do
      cmp -s "$identity_service/$identity_name" "$identity_tmp/service/$identity_name" || identity_fail 'The copied identity key files changed during validation; refusing Tor repair or key replacement.'
    done
  else
    # Stage in the identity volume and then rename on that same filesystem. -n
    # refuses a concurrently created destination; never overwrite existing keys.
    identity_stage=$(mktemp -d "$identity_data/.ghostpay-identity-init.XXXXXXXX")
    for identity_name in hostname hs_ed25519_secret_key hs_ed25519_public_key; do
      cp -- "$identity_tmp/service/$identity_name" "$identity_stage/$identity_name"
      chmod 600 "$identity_stage/$identity_name"
    done
    mv -T -n -- "$identity_stage" "$identity_service"
    [ ! -d "$identity_stage" ] || identity_fail 'An onion identity already exists; initialization never replaces it.'
    identity_stage=
    cat "$identity_service/hostname"
  fi
)
