#!/usr/bin/env bash
# Verify a downloaded GhostPay release. Intended to run on a machine SEPARATE from where you use the app.
#
# Usage: verify-release.sh <tarball> <SHA256SUMS> <expected-commit-sha> <release-manifest.json>
# Example: verify-release.sh ghostpay-web-v1.0.0.tar.gz SHA256SUMS 0123abcd... release-manifest.json
#
# The manifest is required and named explicitly (audit L7-M2: the expected commit is never left uncompared); it and
# the SBOM it names must be present next to SHA256SUMS.
# Needs bash >= 4, tar, sha256sum (or shasum) and node or python3 (GP_VERIFY_JSON=node|python3 forces one).
# Checks hashes and consistency only. Authenticity comes from the signed tag and the build attestation (checklist).
set -euo pipefail

if [ "$#" -ne 4 ]; then sed -n '2,10p' "$0"; exit 2; fi
if [ "${BASH_VERSINFO[0]}" -lt 4 ]; then echo "bash >= 4 is required (macOS: install a current bash, e.g. via Homebrew)"; exit 2; fi
tarball="$1"; sums="$2"; want_commit="$3"
sumdir="$(cd "$(dirname "$sums")" && pwd)"
manifest="$4"

sha256() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'; else shasum -a 256 "$1" | awk '{print $1}'; fi; }
fsize() { wc -c <"$1" | tr -d ' '; }
fail=0
ok()  { echo "PASS  $*"; }
bad() { echo "FAIL  $*"; fail=1; }
die() { echo "FAIL  $*"; echo "RESULT: FAILED"; exit 1; }
release_re='^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z][0-9A-Za-z.-]*)?$'
plain_re='^[A-Za-z0-9][A-Za-z0-9._-]*$'

[ -f "$tarball" ] || { echo "no such file: $tarball"; exit 2; }
[ -f "$sums" ] || { echo "no such file: $sums"; exit 2; }
[ -f "$manifest" ] || die "release manifest not found: $manifest (download release-manifest.json next to SHA256SUMS)"
if [[ ! "$want_commit" =~ ^[0-9a-f]{40}$ ]]; then echo "expected commit must be a full 40-hex SHA"; exit 2; fi
name="$(basename "$tarball")"
mname="$(basename "$manifest")"
actual="$(sha256 "$tarball")"

# 1. SHA256SUMS: strict "<64 hex>  <plain name>" lines, no duplicates.
declare -A listed=()
declare -a order=()
while IFS= read -r line || [ -n "$line" ]; do
  [ -z "$line" ] && continue
  h=""; f=""
  if [[ "$line" =~ ^([0-9a-f]{64})\ [\ *](.+)$ ]]; then h="${BASH_REMATCH[1]}"; f="${BASH_REMATCH[2]}"; fi
  if [ -n "$h" ] && [[ "$f" =~ $plain_re ]] && [[ "$f" != *..* ]]; then
    if [ -n "${listed[$f]:-}" ]; then bad "$f is listed twice in SHA256SUMS"; continue; fi
    listed[$f]="$h"; order+=("$f")
  else
    bad "malformed SHA256SUMS line: $(printf '%q' "$line")"
  fi
done < "$sums"
[ "${#order[@]}" -gt 0 ] || die "SHA256SUMS lists no files"

if [ -z "${listed[$name]:-}" ]; then bad "$name is not listed in SHA256SUMS"
elif [ "${listed[$name]}" = "$actual" ]; then ok "tarball sha256 matches SHA256SUMS ($actual)"
else bad "tarball sha256 $actual != SHA256SUMS ${listed[$name]}"; fi

if [ -z "${listed[$mname]:-}" ]; then bad "SHA256SUMS does not cover $mname"
elif [ "${listed[$mname]}" = "$(sha256 "$manifest")" ]; then ok "$mname matches SHA256SUMS"
else bad "$mname hash does not match SHA256SUMS (manifest altered?)"; fi

# 2. Read the manifest into tab-separated records (values are validated again below).
json_tool="${GP_VERIFY_JSON:-}"
if [ -z "$json_tool" ]; then
  if command -v node >/dev/null 2>&1; then json_tool=node
  elif command -v python3 >/dev/null 2>&1; then json_tool=python3
  else die "node or python3 is required to read the manifest"; fi
fi
case "$json_tool" in
  node) records="$(node -e '
const m = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
if (!m || typeof m !== "object" || Array.isArray(m)) throw new Error("manifest is not an object");
const c = (v) => (v === undefined || v === null ? "" : String(v)).replace(/[\t\r\n]/g, " ");
for (const k of ["schemaVersion", "project", "channel", "version", "tag", "commit", "checksumsFile"]) console.log(`${k}\t${c(m[k])}`);
console.log(`lockfile\t${c(m.lockfile && m.lockfile.sha256)}`);
for (const a of Array.isArray(m.artifacts) ? m.artifacts : []) console.log(["artifact", c(a && a.kind), c(a && a.name), c(a && a.sha256), c(a && a.bytes)].join("\t"));
' "$manifest" 2>/dev/null)" || die "manifest is not valid JSON" ;;
  python3) records="$(python3 -I -c '
import json, sys
m = json.load(open(sys.argv[1], encoding="utf-8"))
if not isinstance(m, dict): raise SystemExit(1)
def c(v):
    if v is None: return ""
    if isinstance(v, bool): return "true" if v else "false"
    return str(v).replace("\t", " ").replace("\r", " ").replace("\n", " ")
for k in ["schemaVersion", "project", "channel", "version", "tag", "commit", "checksumsFile"]: print(k + "\t" + c(m.get(k)))
print("lockfile\t" + c((m.get("lockfile") or {}).get("sha256") if isinstance(m.get("lockfile"), dict) else None))
for a in (m.get("artifacts") if isinstance(m.get("artifacts"), list) else []):
    a = a if isinstance(a, dict) else {}
    print("\t".join(["artifact", c(a.get("kind")), c(a.get("name")), c(a.get("sha256")), c(a.get("bytes"))]))
' "$manifest" 2>/dev/null)" || die "manifest is not valid JSON" ;;
  *) die "GP_VERIFY_JSON must be node or python3" ;;
esac

declare -A field=()
declare -A art_sha=() art_bytes=() art_kind=()
tar_names=(); sbom_names=()
while IFS=$'\t' read -r k a b c d; do
  if [ "$k" = artifact ]; then
    if [[ ! "$b" =~ $plain_re ]] || [[ "$b" == *..* ]] || [[ ! "$c" =~ ^[0-9a-f]{64}$ ]] || [[ ! "$d" =~ ^[0-9]+$ ]]; then
      bad "malformed artifact record in manifest: $(printf '%q' "$b")"; continue
    fi
    [ -n "${art_sha[$b]:-}" ] && { bad "artifact $b appears twice in the manifest"; continue; }
    art_sha[$b]="$c"; art_bytes[$b]="$d"; art_kind[$b]="$a"
    [ "$a" = web-bundle-tarball ] && tar_names+=("$b")
    [ "$a" = sbom ] && sbom_names+=("$b")
  else
    field[$k]="$a"
  fi
done <<<"$records"

# 3. Manifest identity: schema, project, channel, commit, version.
[ "${field[schemaVersion]:-}" = 1 ] && ok "manifest schemaVersion 1" || bad "unsupported manifest schemaVersion '${field[schemaVersion]:-}'"
[ "${field[project]:-}" = ghostpay-web ] && ok "manifest project ghostpay-web" || bad "manifest project '${field[project]:-}' != ghostpay-web"
case "${field[channel]:-}" in
  release) ok "manifest channel is release" ;;
  development) bad "manifest is a DEVELOPMENT build (local, untagged or dirty tree); it is not a release" ;;
  "") bad "manifest has no channel field (built before channels existed, or altered); not accepted as a release" ;;
  *) bad "unknown manifest channel '${field[channel]}'" ;;
esac
if [ "${field[commit]:-}" = "$want_commit" ]; then ok "manifest commit equals expected commit"
else bad "manifest commit '${field[commit]:-}' != expected $want_commit"; fi
ver="${field[version]:-}"
if [[ "$ver" =~ $release_re ]] && [[ "$ver" != *..* ]]; then ok "manifest version $ver is a release tag name"
else bad "manifest version '$ver' is not a release tag name"; fi
[ "${field[tag]:-}" = "$ver" ] && [ -n "$ver" ] || bad "manifest tag '${field[tag]:-}' != version '$ver'"
if [ "$name" = "ghostpay-web-$ver.tar.gz" ]; then ok "tarball name matches manifest version"
else bad "tarball name $name != ghostpay-web-$ver.tar.gz (manifest version)"; fi
[ "$(basename "$sums")" = "${field[checksumsFile]:-}" ] || bad "manifest checksumsFile '${field[checksumsFile]:-}' != $(basename "$sums")"
[[ "${field[lockfile]:-}" =~ ^[0-9a-f]{64}$ ]] || bad "manifest has no lockfile sha256"

# 4. Artifacts: exactly one tarball and one SBOM; every artifact present, listed and matching both hashes.
if [ "${#tar_names[@]}" -ne 1 ]; then bad "manifest must list exactly one web-bundle-tarball (has ${#tar_names[@]})"
elif [ "${tar_names[0]}" != "$name" ]; then bad "manifest tarball is ${tar_names[0]}, not $name"
elif [ "${art_sha[$name]}" != "$actual" ]; then bad "manifest tarball sha256 ${art_sha[$name]} != $actual"
elif [ "${art_bytes[$name]}" != "$(fsize "$tarball")" ]; then bad "manifest tarball size ${art_bytes[$name]} != $(fsize "$tarball")"
else ok "manifest tarball hash and size match"; fi
if [ "${#sbom_names[@]}" -ne 1 ]; then bad "manifest must list exactly one sbom (has ${#sbom_names[@]})"
elif [ -z "${listed[${sbom_names[0]}]:-}" ]; then bad "SHA256SUMS does not cover the SBOM ${sbom_names[0]}"; fi

for f in "${!art_sha[@]}"; do
  [ "$f" = "$name" ] && continue
  p="$sumdir/$f"
  if [ -z "${listed[$f]:-}" ]; then bad "manifest artifact $f is not listed in SHA256SUMS"; continue; fi
  if [ ! -f "$p" ] || [ -L "$p" ]; then bad "$f (${art_kind[$f]}) is missing next to SHA256SUMS or is a symlink"; continue; fi
  h="$(sha256 "$p")"
  if [ "$h" != "${listed[$f]}" ]; then bad "$f hash does not match SHA256SUMS"
  elif [ "$h" != "${art_sha[$f]}" ]; then bad "$f hash does not match the manifest"
  elif [ "$(fsize "$p")" != "${art_bytes[$f]}" ]; then bad "$f size does not match the manifest"
  else ok "$f (${art_kind[$f]}) matches SHA256SUMS and manifest"; fi
done
for f in "${order[@]}"; do
  [ "$f" = "$mname" ] && continue
  [ -n "${art_sha[$f]:-}" ] || bad "$f is listed in SHA256SUMS but not in the manifest"
done

# 5. Archive sanity: only regular files and directories (no symlinks, hardlinks or devices), one top-level
#    directory ghostpay-web/, no absolute or parent paths, no source maps, index.html present.
if listing="$(tar -tzf "$tarball" 2>/dev/null)" && vlisting="$(tar -tvzf "$tarball" 2>/dev/null)"; then
  if [ -z "$listing" ]; then bad "tarball is empty"
  else
    if [ "$(wc -l <<<"$listing")" != "$(wc -l <<<"$vlisting")" ]; then bad "tarball listing is inconsistent"; fi
    types="$(cut -c1 <<<"$vlisting" | sort -u | tr -d '\n')"
    if [[ "$types" =~ ^[-d]+$ ]]; then ok "only regular files and directories"
    else bad "archive contains links or special files (entry types: $types)"; fi
    if grep -qE '(^/|(^|/)\.\.(/|$))' <<<"$listing"; then bad "archive has absolute or parent paths"; else ok "no absolute/parent paths"; fi
    if [ "$(cut -d/ -f1 <<<"$listing" | sort -u)" = "ghostpay-web" ]; then ok "single top-level directory ghostpay-web/"
    else bad "archive top-level entries are not exactly ghostpay-web/"; fi
    if grep -qE '\.map$' <<<"$listing"; then bad "source maps present"; else ok "no source maps"; fi
    if grep -qxE 'ghostpay-web/index\.html' <<<"$listing"; then ok "index.html present"; else bad "ghostpay-web/index.html missing"; fi
  fi
else
  bad "tarball is not a readable .tar.gz"
fi

cat <<CHECKLIST

Hash checks above only show that these files are consistent with each other. They do not show they are authentic.
Remaining steps (see docs/operators/release-and-verify.md):
  [ ] Verify the signed tag against the independently published key, and that it points at the commit you passed:
        bash scripts/verify-tag.sh --allowed-signers <your copy of allowed_signers> ${ver:-<tag>} $want_commit
  [ ] Verify the build attestation:
        gh attestation verify "$name" --repo <owner>/<repo> --source-ref refs/tags/${ver:-<tag>}
  [ ] Optional: rebuild from the tagged commit (scripts/release-build.sh) and compare the tarball sha256.
  [ ] Compare against the files your host actually serves:   sha256sum <each served file>  vs  the tarball contents
      (do this from a separate machine/network; the in-app hash widget cannot do this for you)
  [ ] Compare deployments/*.json router/announcer/feeRecipient with addresses published through an independent channel.
CHECKLIST

if [ "$fail" -eq 0 ]; then echo "RESULT: hash checks passed"; else echo "RESULT: FAILED"; fi
exit "$fail"
