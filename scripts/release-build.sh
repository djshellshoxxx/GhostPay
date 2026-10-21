#!/usr/bin/env bash
# Deterministic release build of the GhostPay web bundle.
#
# Produces, in $OUT_DIR (default: <repo>/release-out):
#   ghostpay-web-<VERSION>.tar.gz   deterministic tarball of apps/web/dist (sorted, owner 0, fixed mtime, gzip -n)
#   sbom.cdx.json                   CycloneDX SBOM from `npm sbom` (production dependencies)
#   release-manifest.json           see scripts/gen-release-manifest.mjs
#   SHA256SUMS                      sha256 of the three files above
#
# Environment:
#   VERSION            label used in the tarball name (default: `git describe --tags --always`)
#   SOURCE_DATE_EPOCH  default: commit time of HEAD (the tag commit when building a tag)
#   GP_COMMIT          commit id to record when the tree has no .git (used by repro-check.sh --worktree)
#   OUT_DIR            output directory
#   GP_SKIP_INSTALL=1  do not run `npm ci` (node_modules already installed by the caller)
#
# Network access is needed for `npm ci` unless GP_SKIP_INSTALL=1.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib-common.sh
. "$here/lib-common.sh"
cd "$here/.."
root="$(pwd)"

if [ -z "${GP_COMMIT:-}" ]; then
  GP_COMMIT="$(git rev-parse HEAD 2>/dev/null)" || gp_die "no git metadata; set GP_COMMIT"
fi
if [ -z "${SOURCE_DATE_EPOCH:-}" ]; then
  SOURCE_DATE_EPOCH="$(git log -1 --format=%ct HEAD 2>/dev/null)" || gp_die "no git metadata; set SOURCE_DATE_EPOCH"
fi
export SOURCE_DATE_EPOCH GP_COMMIT
VERSION="${VERSION:-$(git describe --tags --always 2>/dev/null || echo "${GP_COMMIT:0:12}")}"
OUT_DIR="${OUT_DIR:-$root/release-out}"
export TZ=UTC LC_ALL=C

echo "== release-build: version=$VERSION commit=$GP_COMMIT SOURCE_DATE_EPOCH=$SOURCE_DATE_EPOCH"

if [ "${GP_SKIP_INSTALL:-0}" != "1" ]; then
  npm ci --ignore-scripts --no-audit --no-fund
fi
# Workspace packages resolve each other through their built dist; never trust a pre-existing dist.
rm -rf packages/*/dist apps/web/dist
npm run build:libs
npm run build --workspace @ghostpay/web   # includes tsc and the postbuild bundle scan

[ -f apps/web/dist/index.html ] || gp_die "apps/web/dist/index.html missing after build"

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"
tarball="ghostpay-web-${VERSION}.tar.gz"

# Deterministic tar: sorted names, numeric owner 0, fixed mtime, no atime/ctime pax headers, gzip without name/timestamp.
tar --sort=name --owner=0 --group=0 --numeric-owner --mode='u=rwX,go=rX' \
  --mtime="@${SOURCE_DATE_EPOCH}" --format=posix \
  --pax-option='exthdr.name=%d/PaxHeaders/%f,delete=atime,delete=ctime' \
  --transform 's,^dist,ghostpay-web,' -C apps/web -cf - dist | gzip -n -9 > "$OUT_DIR/$tarball"

# SBOM: production dependency tree from the lockfile. The CycloneDX serialNumber is random per run, so it is
# replaced with a value derived from the lockfile digest to keep the file reproducible.
lock_sha="$(gp_sha256 package-lock.json)"
npm sbom --sbom-format cyclonedx --omit dev --sbom-type application > "$OUT_DIR/sbom.cdx.json.tmp"
node "$here/normalize-sbom.mjs" "$OUT_DIR/sbom.cdx.json.tmp" "$lock_sha" "$SOURCE_DATE_EPOCH" > "$OUT_DIR/sbom.cdx.json"
rm -f "$OUT_DIR/sbom.cdx.json.tmp"

node "$here/gen-release-manifest.mjs" --out-dir "$OUT_DIR" --tarball "$tarball" --version "$VERSION" \
  --commit "$GP_COMMIT" --source-date-epoch "$SOURCE_DATE_EPOCH" --lockfile "$root/package-lock.json" \
  --sbom sbom.cdx.json > "$OUT_DIR/release-manifest.json"

( cd "$OUT_DIR" && for f in "$tarball" sbom.cdx.json release-manifest.json; do
    printf '%s  %s\n' "$(gp_sha256 "$f")" "$f"
  done > SHA256SUMS )

echo "== release-build: done"
cat "$OUT_DIR/SHA256SUMS"
