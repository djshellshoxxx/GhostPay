#!/usr/bin/env bash
# Verify a downloaded GhostPay release. Intended to run on a machine SEPARATE from where you use the app.
#
# Usage: verify-release.sh <tarball> <SHA256SUMS> <expected-commit-sha> [release-manifest.json]
# Example: verify-release.sh ghostpay-web-v1.0.0.tar.gz SHA256SUMS 0123abcd... release-manifest.json
#
# Needs only bash, tar and sha256sum (or shasum). Uses node or python3 to read the manifest if one is given.
# This script checks hashes and consistency. It does NOT prove authenticity by itself: authenticity comes from the
# signed tag and the build attestation (checklist printed at the end).
set -euo pipefail

if [ "$#" -lt 3 ]; then sed -n '2,10p' "$0"; exit 2; fi
tarball="$1"; sums="$2"; want_commit="$3"; manifest="${4:-}"

sha256() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'; else shasum -a 256 "$1" | awk '{print $1}'; fi; }
fail=0
ok()  { echo "PASS  $*"; }
bad() { echo "FAIL  $*"; fail=1; }

[ -f "$tarball" ] || { echo "no such file: $tarball"; exit 2; }
[ -f "$sums" ] || { echo "no such file: $sums"; exit 2; }
if [[ ! "$want_commit" =~ ^[0-9a-f]{40}$ ]]; then echo "expected commit must be a full 40-hex SHA"; exit 2; fi

# 1. Tarball hash is listed in SHA256SUMS and matches.
name="$(basename "$tarball")"
listed="$(awk -v n="$name" '$2==n || $2=="*"n {print $1}' "$sums")"
actual="$(sha256 "$tarball")"
if [ -z "$listed" ]; then bad "$name is not listed in $sums"
elif [ "$listed" = "$actual" ]; then ok "tarball sha256 matches SHA256SUMS ($actual)"
else bad "tarball sha256 $actual != listed $listed"; fi

# 2. Every other file named in SHA256SUMS that sits next to it must match.
sumdir="$(cd "$(dirname "$sums")" && pwd)"
while read -r h f; do
  f="${f#\*}"
  [ "$f" = "$name" ] && continue
  if [ -f "$sumdir/$f" ]; then
    a="$(sha256 "$sumdir/$f")"
    if [ "$a" = "$h" ]; then ok "$f matches SHA256SUMS"; else bad "$f hash mismatch"; fi
  else
    echo "SKIP  $f (not downloaded)"
  fi
done < "$sums"

# 3. Manifest commit equals the expected commit (the one in the SIGNED tag you verified).
if [ -n "$manifest" ]; then
  [ -f "$manifest" ] || { echo "no such file: $manifest"; exit 2; }
  if command -v node >/dev/null 2>&1; then
    m_commit="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).commit)' "$manifest")"
    m_tar="$(node -e 'const m=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log((m.artifacts.find(a=>a.kind==="web-bundle-tarball")||{}).sha256)' "$manifest")"
  elif command -v python3 >/dev/null 2>&1; then
    m_commit="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["commit"])' "$manifest")"
    m_tar="$(python3 -c 'import json,sys;print(next(a for a in json.load(open(sys.argv[1]))["artifacts"] if a["kind"]=="web-bundle-tarball")["sha256"])' "$manifest")"
  else
    m_commit=""; m_tar=""; echo "SKIP  manifest check (needs node or python3)"
  fi
  if [ -n "$m_commit" ]; then
    if [ "$m_commit" = "$want_commit" ]; then ok "manifest commit equals expected commit"; else bad "manifest commit $m_commit != expected $want_commit"; fi
    if [ "$m_tar" = "$actual" ]; then ok "manifest tarball hash matches"; else bad "manifest tarball hash $m_tar != $actual"; fi
  fi
fi

# 4. Archive sanity: single top-level dir, no source maps, no absolute or parent paths, index.html present.
listing="$(tar -tzf "$tarball")" || { bad "tarball is not a readable .tar.gz"; listing=""; }
if [ -n "$listing" ]; then
  if grep -qE '(^/|(^|/)\.\.(/|$))' <<<"$listing"; then bad "archive has absolute or parent paths"; else ok "no absolute/parent paths"; fi
  if [ "$(echo "$listing" | cut -d/ -f1 | sort -u | wc -l | tr -d ' ')" = "1" ]; then ok "single top-level directory"; else bad "multiple top-level entries"; fi
  if grep -qE '\.map$' <<<"$listing"; then bad "source maps present"; else ok "no source maps"; fi
  if grep -qE '(^|/)index\.html$' <<<"$listing"; then ok "index.html present"; else bad "index.html missing"; fi
fi

cat <<CHECKLIST

Hash checks above only show that these files match SHA256SUMS. They do not show the files are authentic.
Remaining steps (see docs/operators/release-and-verify.md):
  [ ] Verify the signed tag and confirm it points at the commit you passed:   git verify-tag <tag>
      and: git rev-parse <tag>^{commit}   ==   $want_commit
      (obtain the maintainer's public key from a channel independent of this download)
  [ ] Verify the build attestation:   gh attestation verify "$name" --repo <owner>/<repo>
  [ ] Optional: rebuild from the tagged commit (scripts/release-build.sh) and compare the tarball sha256.
  [ ] Compare against the files your host actually serves:   sha256sum <each served file>  vs  the tarball contents
      (do this from a separate machine/network; the in-app hash widget cannot do this for you)
  [ ] Compare deployments/*.json router/announcer/feeRecipient with addresses published through an independent channel.
CHECKLIST

if [ "$fail" -eq 0 ]; then echo "RESULT: hash checks passed"; else echo "RESULT: FAILED"; fi
exit "$fail"
