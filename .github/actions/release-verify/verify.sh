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
[ -f "$dir/$sums" ] || { echo "::error::missing $dir/$sums"; exit 1; }
[ -f "$dir/$manifest" ] || { echo "::error::missing $dir/$manifest"; exit 1; }

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
  if [ ! -f "$dir/$f" ]; then err "$f is listed in $sums but missing"; continue; fi
  a="$(sha256 "$dir/$f")"
  if [ "$a" = "$h" ]; then pass "$f matches $sums"; else err "$f hash mismatch (actual $a, listed $h)"; fi
done < "$dir/$sums"
[ "$count" -gt 0 ] || err "$sums lists no files"

# 2. Manifest: parse to tab-separated records without evaluating anything from it.
parse() {
  if command -v python3 >/dev/null 2>&1; then
    python3 -I - "$dir/$manifest" <<'PY'
import json, sys
m = json.load(open(sys.argv[1]))
print("schema\t%s" % m.get("schemaVersion"))
print("commit\t%s" % m.get("commit"))
print("sums\t%s" % m.get("checksumsFile"))
for a in m.get("artifacts", []):
    print("artifact\t%s\t%s\t%s" % (a.get("name"), a.get("sha256"), a.get("bytes")))
PY
  elif command -v node >/dev/null 2>&1; then
    node -e 'const m=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));
      console.log("schema\t"+m.schemaVersion);console.log("commit\t"+m.commit);console.log("sums\t"+m.checksumsFile);
      for(const a of m.artifacts||[])console.log("artifact\t"+a.name+"\t"+a.sha256+"\t"+a.bytes);' "$dir/$manifest"
  else
    echo "::error::need python3 or node to read the manifest" >&2; return 1
  fi
}
records="$(parse)" || { err "manifest is not readable JSON"; records=""; }

n_art=0
while IFS=$'\t' read -r kind a b c; do
  case "$kind" in
    schema) [ "$a" = "1" ] && pass "manifest schemaVersion 1" || err "unsupported manifest schemaVersion: $a" ;;
    commit)
      if [ "$a" = "$want" ]; then pass "manifest commit equals expected commit"; else err "manifest commit '$a' != expected $want"; fi ;;
    sums) [ "$a" = "$sums" ] && pass "manifest names $sums" || err "manifest checksumsFile '$a' != $sums" ;;
    artifact)
      n_art=$((n_art + 1))
      if ! safe_name "$a" || [[ ! "$b" =~ ^[0-9a-f]{64}$ ]]; then err "malformed artifact record in manifest"; continue; fi
      if [ ! -f "$dir/$a" ]; then err "manifest artifact $a is missing"; continue; fi
      act="$(sha256 "$dir/$a")"
      [ "$act" = "$b" ] && pass "manifest hash for $a matches the file" || err "manifest hash for $a does not match the file"
      [ "${listed[$a]:-}" = "$b" ] && pass "$a is in $sums with the same hash" || err "$a missing from $sums or hash differs"
      size="$(wc -c < "$dir/$a" | tr -d ' ')"
      [ "$size" = "$c" ] && pass "$a size $size bytes matches manifest" || err "$a size $size != manifest $c" ;;
  esac
done <<< "$records"
[ "$n_art" -gt 0 ] || err "manifest lists no artifacts"
[ -n "${listed[$manifest]:-}" ] || err "$manifest is not covered by $sums"

echo
if [ "$fail" -ne 0 ]; then echo "RELEASE VERIFICATION FAILED"; exit 1; fi
cat <<'NOTE'
Hashes and manifest are consistent. This does NOT prove authenticity. Still required (docs/operators/release-and-verify.md):
  - the expected-commit input came from a verified signed tag, obtained independently of these artifacts
  - build attestation: set verify-attestation: 'true' or run `gh attestation verify <file> --repo <owner>/<repo>`
NOTE
