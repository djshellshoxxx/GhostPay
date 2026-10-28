#!/usr/bin/env bash
# Fails if the CSP / Permissions-Policy in Caddyfile, nginx ghostpay-headers.conf, infra/web/Caddyfile.static or the
# index.html meta differ from apps/web/public/_headers (the source of truth), if an embed SDK route (v1, v2) lacks
# Access-Control-Allow-Origin "*" and Cross-Origin-Resource-Policy cross-origin (as _headers sends them), or if a
# config can serve dotfiles. Static check, no network.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; root="$here/../.."
want_csp="$(sed -n 's/^  Content-Security-Policy: //p' "$root/apps/web/public/_headers")"
want_pp="$(sed -n 's/^  Permissions-Policy: //p' "$root/apps/web/public/_headers")"
[ -n "$want_csp" ] && [ -n "$want_pp" ] || { echo "ERROR: cannot read _headers"; exit 1; }
rc=0
chk() { # file label needle
  if grep -qF -- "$3" "$1"; then :; else echo "ERROR: $2 differs from _headers: $1"; rc=1; fi
}
# block FILE START: the lines from the first line containing START up to its closing brace.
block() {
  awk -v start="$2" '
    !on && index($0, start) { on = 1 }
    on { print; depth += gsub(/\{/, "{") - gsub(/\}/, "}"); if (depth <= 0) exit }
  ' "$1"
}
route() { # file label start needle...
  local f="$1" label="$2" b n
  b="$(block "$f" "$3")"
  shift 3
  if [ -z "$b" ]; then echo "ERROR: $label route missing: $f"; rc=1; return; fi
  for n in "$@"; do
    if grep -qF -- "$n" <<<"$b"; then :; else echo "ERROR: $label route lacks '$n': $f"; rc=1; fi
  done
}

for f in "$here/Caddyfile" "$root/infra/web/Caddyfile.static"; do
  chk "$f" CSP "Content-Security-Policy \"$want_csp\""
  chk "$f" Permissions-Policy "Permissions-Policy \"$want_pp\""
  for v in v1 v2; do
    route "$f" "embed $v" "handle /ghostpay-embed-$v.js {" 'header Access-Control-Allow-Origin "*"' 'header Cross-Origin-Resource-Policy "cross-origin"'
  done
  # Dotfiles: every file_server hides them (try_files would otherwise find e.g. /.env or /.git/config).
  servers="$(grep -cE '^[[:space:]]*file_server([[:space:]]|$)' "$f" || true)"
  hidden="$(grep -cE '^[[:space:]]*hide \.\*$' "$f" || true)"
  if [ "$servers" -eq 0 ] || [ "$servers" != "$hidden" ]; then echo "ERROR: every file_server must hide dotfiles (hide .*): $f"; rc=1; fi
done

chk "$here/ghostpay-headers.conf" CSP "Content-Security-Policy \"$want_csp\""
chk "$here/ghostpay-headers.conf" Permissions-Policy "Permissions-Policy \"$want_pp\""
for v in v1 v2; do
  route "$here/nginx.conf" "embed $v" "location = /ghostpay-embed-$v.js {" 'add_header Access-Control-Allow-Origin "*" always;' 'add_header Cross-Origin-Resource-Policy "cross-origin" always;'
done
if grep -qF 'location ~ /\.(?!well-known/) {' "$here/nginx.conf"; then :; else echo "ERROR: dotfile deny (location ~ /\\.(?!well-known/) { deny all; }) missing: $here/nginx.conf"; rc=1; fi

# index.html meta CSP omits frame-ancestors (ignored in meta); everything else must match.
meta_want="${want_csp/; frame-ancestors \'none\'/}"
chk "$root/apps/web/index.html" "meta CSP" "content=\"$meta_want\""
[ "$rc" -eq 0 ] && echo "OK: proxy and meta headers match apps/web/public/_headers; embed routes send CORS/CORP; dotfiles are not served"
exit "$rc"
