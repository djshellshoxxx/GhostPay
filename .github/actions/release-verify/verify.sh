#!/usr/bin/env bash
# Verify release artifacts against SHA256SUMS and release-manifest.json.
# Env: GP_DIR (dir), GP_SUMS (name), GP_MANIFEST (name), GP_COMMIT (expected 40-hex commit).
# Exit 0 only if every check passes. Reads only; never executes artifact content.
set -euo pipefail

dir="${GP_DIR:?}"; sums="${GP_SUMS:?}"; manifest="${GP_MANIFEST:?}"; want="${GP_COMMIT:-}"
fail=0
err()  { echo "::error::$*"; fail=1; }
pass() { echo "PASS  $*"; }

sha256() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'; else shasum -a 256 "$1" | awk '{print $1}'; fi; }
safe_name() { [[ "$1" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] && [[ "$1" != *..* ]]; }

[[ "$want" =~ ^[0-9a-f]{40}$ ]] || { echo "::error::expected-commit must be a full 40-hex SHA"; exit 1; }
safe_name "$sums" && safe_name "$manifest" || { echo "::error::sums-file and manifest-file must be plain file names"; exit 1; }
[ -d "$dir" ] || { echo "::error::artifact-dir not found: $dir"; exit 1; }
[ -f "$dir/$sums" ] && [ ! -L "$dir/$sums" ] || { echo "::error::missing or unsafe $dir/$sums"; exit 1; }
[ -f "$dir/$manifest" ] && [ ! -L "$dir/$manifest" ] || { echo "::error::missing or unsafe $dir/$manifest"; exit 1; }

# 1. Every file listed in SHA256SUMS exists and matches. Format: "<64 hex>  <name>".
declare -A listed=()
count=0
while IFS= read -r line || [ -n "$line" ]; do
  [ -z "$line" ] && continue
  if [[ ! "$line" =~ ^([0-9a-f]{64})[[:space:]]+\*?([^[:space:]]+)$ ]]; then err "malformed line in $sums"; continue; fi
  h="${BASH_REMATCH[1]}"; f="${BASH_REMATCH[2]}"
  if ! safe_name "$f"; then err "unsafe file name in $sums: $f"; continue; fi
  if [ -n "${listed[$f]:-}" ]; then err "duplicate entry in $sums: $f"; continue; fi
  listed[$f]="$h"; count=$((count + 1))
  if [ ! -f "$dir/$f" ] || [ -L "$dir/$f" ]; then err "$f is listed in $sums but missing or unsafe"; continue; fi
  a="$(sha256 "$dir/$f")"
  if [ "$a" = "$h" ]; then pass "$f matches $sums"; else err "$f hash mismatch (actual $a, listed $h)"; fi
done < "$dir/$sums"
[ "$count" -gt 0 ] || err "$sums lists no files"

# 2. Manifest: strictly validate JSON and print safe tab-separated records.
parse() {
  command -v python3 >/dev/null 2>&1 || { echo "::error::python3 is required to validate the manifest" >&2; return 1; }
  python3 -I - "$dir/$manifest" "$sums" "$want" <<'PY'
import json, re, sys

def no_duplicate_keys(pairs):
    obj = {}
    for k, v in pairs:
        if k in obj:
            raise ValueError("duplicate JSON key")
        obj[k] = v
    return obj

def plain_name(s):
    return isinstance(s, str) and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", s) is not None and ".." not in s

try:
    with open(sys.argv[1], "r", encoding="utf-8") as f:
        m = json.load(f, object_pairs_hook=no_duplicate_keys)
    sums, want = sys.argv[2:4]
    if not isinstance(m, dict) or m.get("schemaVersion") != 1:
        raise ValueError("unsupported schemaVersion")
    if m.get("commit") != want or not re.fullmatch(r"[0-9a-f]{40}", m.get("commit", "")):
        raise ValueError("invalid commit")
    if m.get("checksumsFile") != sums or not plain_name(m.get("checksumsFile")):
        raise ValueError("invalid checksumsFile")
    arts = m.get("artifacts")
    if not isinstance(arts, list) or not arts:
        raise ValueError("artifacts must be a nonempty array")
    seen = set()
    for a in arts:
        if not isinstance(a, dict):
            raise ValueError("artifact must be an object")
        name, digest, size = a.get("name"), a.get("sha256"), a.get("bytes")
        if not plain_name(name) or name in seen:
            raise ValueError("invalid or duplicate artifact name")
        if not isinstance(digest, str) or re.fullmatch(r"[0-9a-f]{64}", digest) is None:
            raise ValueError("invalid artifact sha256")
        if type(size) is not int or size < 0:
            raise ValueError("invalid artifact byte count")
        seen.add(name)
    print("schema\t1")
    print("commit\t" + m["commit"])
    print("sums\t" + m["checksumsFile"])
    for a in arts:
        print("artifact\t{}\t{}\t{}".format(a["name"], a["sha256"], a["bytes"]))
except Exception as e:
    print("invalid release manifest: " + str(e), file=sys.stderr)
    sys.exit(1)
PY
}
records="$(parse)" || { err "manifest is not readable JSON"; records=""; }

n_art=0
declare -A manifest_artifact=()
while IFS=$'\t' read -r kind a b c; do
  case "$kind" in
    schema) [ "$a" = "1" ] && pass "manifest schemaVersion 1" || err "unsupported manifest schemaVersion: $a" ;;
    commit)
      if [ "$a" = "$want" ]; then pass "manifest commit equals expected commit"; else err "manifest commit '$a' != expected $want"; fi ;;
    sums) [ "$a" = "$sums" ] && pass "manifest names $sums" || err "manifest checksumsFile '$a' != $sums" ;;
    artifact)
      n_art=$((n_art + 1))
      if ! safe_name "$a" || [[ ! "$b" =~ ^[0-9a-f]{64}$ ]]; then err "malformed artifact record in manifest"; continue; fi
      manifest_artifact[$a]="$b"
      if [ ! -f "$dir/$a" ] || [ -L "$dir/$a" ]; then err "manifest artifact $a is missing or unsafe"; continue; fi
      act="$(sha256 "$dir/$a")"
      [ "$act" = "$b" ] && pass "manifest hash for $a matches the file" || err "manifest hash for $a does not match the file"
      [ "${listed[$a]:-}" = "$b" ] && pass "$a is in $sums with the same hash" || err "$a missing from $sums or hash differs"
      size="$(wc -c < "$dir/$a" | tr -d ' ')"
      [ "$size" = "$c" ] && pass "$a size $size bytes matches manifest" || err "$a size $size != manifest $c" ;;
  esac
done <<< "$records"
[ "$n_art" -gt 0 ] || err "manifest lists no artifacts"
[ -n "${listed[$manifest]:-}" ] || err "$manifest is not covered by $sums"
for f in "${!listed[@]}"; do
  if [ "$f" != "$manifest" ] && [ -z "${manifest_artifact[$f]:-}" ]; then err "$f is listed in $sums but absent from the manifest"; fi
done

echo
if [ "$fail" -ne 0 ]; then echo "RELEASE VERIFICATION FAILED"; exit 1; fi
cat <<'NOTE'
Hashes and manifest are consistent. This does NOT prove authenticity. Still required (docs/operators/release-and-verify.md):
  - the expected-commit input came from a verified signed tag, obtained independently of these artifacts
  - build attestation: set verify-attestation: 'true' or run `gh attestation verify <file> --repo <owner>/<repo>`
NOTE
