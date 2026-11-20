#!/bin/sh
set -eu
umask 077

case "$#:$*" in
  0:|1:--check-runtime|1:--verify-config) ;;
  *) printf '%s\n' 'Supported options: --check-runtime or --verify-config.' >&2; exit 1 ;;
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

/usr/local/bin/tor --defaults-torrc /dev/null -f /etc/tor/torrc --verify-config
[ "${1-}" != '--verify-config' ] || exit 0
exec /usr/local/bin/tor --defaults-torrc /dev/null -f /etc/tor/torrc
