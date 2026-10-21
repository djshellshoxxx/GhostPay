#!/usr/bin/env bash
# Reproducibility check: builds the release twice in two separate clean directories (different paths) and fails
# if the tarball or SBOM differ.
#
# Usage: scripts/repro-check.sh [--head | --worktree]
#   --head      (default) `git clone` the current HEAD into each directory (committed state only)
#   --worktree  copy tracked + untracked-but-not-ignored files of the working tree (for testing uncommitted changes)
# Environment: KEEP=1 keeps the temp directories; VERSION overrides the label (default: fixed "repro").
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib-common.sh
. "$here/lib-common.sh"
repo="$(cd "$here/.." && pwd)"
mode="${1:---head}"
case "$mode" in --head|--worktree) ;; *) gp_die "usage: repro-check.sh [--head|--worktree]";; esac

commit="$(git -C "$repo" rev-parse HEAD)"
epoch="$(git -C "$repo" log -1 --format=%ct HEAD)"
tmp="$(mktemp -d "${TMPDIR:-/tmp}/ghostpay-repro.XXXXXX")"
# shellcheck disable=SC2329  # invoked via trap
cleanup() { if [ "${KEEP:-0}" = "1" ]; then echo "kept $tmp"; else rm -rf "$tmp"; fi; }
trap cleanup EXIT

declare -a sums=()
for run in a-first b-second/nested; do
  dir="$tmp/$run/ghostpay"
  mkdir -p "$dir"
  if [ "$mode" = "--head" ]; then
    git clone --quiet --no-hardlinks "$repo" "$dir"
    git -C "$dir" checkout --quiet "$commit"
  else
    ( cd "$repo" && git ls-files -z --cached --others --exclude-standard | tar --null -T - -cf - ) | tar -xf - -C "$dir"
  fi
  echo "== build in $dir"
  ( cd "$dir" && VERSION="${VERSION:-repro}" SOURCE_DATE_EPOCH="$epoch" GP_COMMIT="$commit" OUT_DIR="$dir/release-out" \
      bash scripts/release-build.sh >"$tmp/$(basename "$(dirname "$dir")").log" 2>&1 ) \
    || { echo "build failed; log tail:"; tail -n 40 "$tmp/$(basename "$(dirname "$dir")").log"; exit 2; }
  sums+=("$dir/release-out")
done

rc=0
for f in "ghostpay-web-${VERSION:-repro}.tar.gz" sbom.cdx.json; do
  h1="$(gp_sha256 "${sums[0]}/$f")"; h2="$(gp_sha256 "${sums[1]}/$f")"
  if [ "$h1" = "$h2" ]; then echo "SAME  $f  $h1"; else echo "DIFF  $f  $h1 != $h2"; rc=1; fi
done

if [ "$rc" -ne 0 ]; then
  echo "== NOT reproducible. Differences inside the tarball:"
  mkdir -p "$tmp/x1" "$tmp/x2"
  tar -xzf "${sums[0]}/ghostpay-web-${VERSION:-repro}.tar.gz" -C "$tmp/x1"
  tar -xzf "${sums[1]}/ghostpay-web-${VERSION:-repro}.tar.gz" -C "$tmp/x2"
  diff -rq "$tmp/x1" "$tmp/x2" || true
fi
[ "$rc" -eq 0 ] && echo "REPRODUCIBLE: both builds are byte-identical."
exit "$rc"
