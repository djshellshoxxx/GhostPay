#!/bin/sh
set -eu
umask 077

case "$#:$*" in
  0:|1:--check-runtime|1:--verify-config|1:--initialize-identity|1:--check-identity) ;;
  *) printf '%s\n' 'Supported options: --check-runtime, --verify-config, --initialize-identity or --check-identity.' >&2; exit 1 ;;
esac

. /usr/local/lib/ghostpay/runtime-check.sh
tor_runtime_report=$(/usr/local/bin/tor --version)
tor_runtime_modules=$(/usr/local/bin/tor --list-modules)
check_tor_runtime "$tor_runtime_report" "$tor_runtime_modules"
[ "${1-}" != '--check-runtime' ] || exit 0

if [ "$(id -u)" -eq 0 ] || [ ! -d /var/lib/tor ] || [ -L /var/lib/tor ] \
    || [ "$(stat -c '%a' /var/lib/tor)" != '700' ] \
    || [ "$(stat -c '%u' /var/lib/tor)" != "$(id -u)" ]; then
  printf '%s\n' 'Tor requires a private 0700 data volume owned by its non-root runtime user.' >&2
  exit 1
fi

# --verify-config is syntax/topology validation only: it neither loads onion keys
# nor connects. Ordinary startup must validate the actual pinned identity first.
if [ "${1-}" != '--verify-config' ]; then
  . /usr/local/lib/ghostpay/identity-check.sh
  if [ "${1-}" = '--initialize-identity' ]; then
    check_tor_identity initialize /var/lib/tor /etc/tor/expected-hostname /usr/local/bin/tor
    exit 0
  fi
  check_tor_identity verify /var/lib/tor /etc/tor/expected-hostname /usr/local/bin/tor
  [ "${1-}" != '--check-identity' ] || exit 0
fi

/usr/local/bin/tor --defaults-torrc /dev/null -f /etc/tor/torrc --verify-config
[ "${1-}" != '--verify-config' ] || exit 0
exec /usr/local/bin/tor --defaults-torrc /dev/null -f /etc/tor/torrc
