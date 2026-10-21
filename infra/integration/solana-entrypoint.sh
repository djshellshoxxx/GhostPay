#!/bin/sh
# solana-test-validator refuses --bind-address 0.0.0.0 (panics: UnspecifiedIpAddr) and wants a concrete interface
# address. Use the container's own address; the RPC port then answers on that address AND on 127.0.0.1
# (checked with v3.1.14 on a non-loopback address), so other compose services and the healthcheck both reach it.
set -eu
ip="$(hostname -I 2>/dev/null | cut -d' ' -f1 || true)"
[ -n "$ip" ] || ip="$(getent hosts "$(hostname)" | cut -d' ' -f1)"
[ -n "$ip" ] || { echo "solana-entrypoint: cannot determine container IP" >&2; exit 1; }
exec solana-test-validator --bind-address "$ip" "$@"
