#!/usr/bin/env bash
# Compute (and optionally pin) the IPFS CID of a GhostPay web bundle.
# DEFAULT IS DRY RUN: `ipfs add --only-hash` writes nothing to any repo and contacts no peer.
# Pinning/publishing requires BOTH --publish and GP_IPFS_PUBLISH=yes, and is the owner's decision (ADR-0015).
#
# Usage: infra/publish/ipfs-publish.sh <dist-dir | release-tarball.tar.gz> [--publish]
# Output: CID line, plus a per-file sha256 list to publish beside it. The CID is reproducible: same bytes, same flags,
# same CID. Flags are fixed below (CIDv1, raw leaves, 256 KiB fixed chunker, sha2-256, no wrap, no hidden files).
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../scripts/lib-common.sh
. "$here/../../scripts/lib-common.sh"

src="${1:-}"; mode="dry-run"
[ -n "$src" ] || gp_die "usage: $0 <dist-dir|tarball> [--publish]"
[ "${2:-}" = "--publish" ] && mode="publish"
command -v ipfs >/dev/null 2>&1 || gp_die "ipfs (kubo) not found; install it from the official kubo docs and re-run. Nothing was done."

work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
if [ -d "$src" ]; then dir="$src"
else
  [ -f "$src" ] || gp_die "not found: $src"
  tar -xzf "$src" -C "$work" --no-same-owner --no-same-permissions
  dir="$work/ghostpay-web"; [ -d "$dir" ] || gp_die "tarball has no ghostpay-web/ directory"
fi
[ -f "$dir/index.html" ] || gp_die "$dir/index.html missing"
if find "$dir" -name '*.map' | grep -q .; then gp_die "source map present; refusing"; fi

flags=(--cid-version=1 --raw-leaves --chunker=size-262144 --hash=sha2-256 -r --quieter)
echo "== file hashes (publish these through an independent channel)"
(cd "$dir" && find . -type f | LC_ALL=C sort | xargs sha256sum)

cid="$(ipfs add "${flags[@]}" --only-hash "$dir")"
echo "== dry-run CID: $cid"
if [ "$mode" != "publish" ]; then
  echo "dry run only: nothing pinned. Re-run with --publish and GP_IPFS_PUBLISH=yes to pin on the local node."
  exit 0
fi
[ "${GP_IPFS_PUBLISH:-}" = "yes" ] || gp_die "--publish needs GP_IPFS_PUBLISH=yes"
real="$(ipfs add "${flags[@]}" "$dir")"
[ "$real" = "$cid" ] || gp_die "pinned CID $real != dry-run CID $cid"
echo "pinned locally: $real  (record it in release-manifest publication.ipfsCid; this does not announce it anywhere else)"
