#!/usr/bin/env bash
# Fails if the CSP / Permissions-Policy in Caddyfile, nginx ghostpay-headers.conf or index.html meta differ from
# apps/web/public/_headers (the source of truth). Static check, no network.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; root="$here/../.."
want_csp="$(sed -n 's/^  Content-Security-Policy: //p' "$root/apps/web/public/_headers")"
want_pp="$(sed -n 's/^  Permissions-Policy: //p' "$root/apps/web/public/_headers")"
[ -n "$want_csp" ] && [ -n "$want_pp" ] || { echo "ERROR: cannot read _headers"; exit 1; }
rc=0
chk() { # file label needle
  if grep -qF -- "$3" "$1"; then :; else echo "ERROR: $2 differs from _headers: $1"; rc=1; fi
}
chk "$here/Caddyfile" CSP "Content-Security-Policy \"$want_csp\""
chk "$here/Caddyfile" Permissions-Policy "Permissions-Policy \"$want_pp\""
chk "$here/ghostpay-headers.conf" CSP "Content-Security-Policy \"$want_csp\""
chk "$here/ghostpay-headers.conf" Permissions-Policy "Permissions-Policy \"$want_pp\""
# index.html meta CSP omits frame-ancestors (ignored in meta); everything else must match.
meta_want="${want_csp/; frame-ancestors \'none\'/}"
chk "$root/apps/web/index.html" "meta CSP" "content=\"$meta_want\""
[ "$rc" -eq 0 ] && echo "OK: proxy and meta headers match apps/web/public/_headers"
exit "$rc"
