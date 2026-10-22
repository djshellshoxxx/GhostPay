#!/usr/bin/env bash
# Shared helpers, sourced by the other scripts. Not meant to be executed directly.

# sha256 of a file, portable across GNU coreutils and macOS.
gp_sha256() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'
  else shasum -a 256 "$1" | awk '{print $1}'; fi
}

gp_die() { echo "ERROR: $*" >&2; exit 1; }
