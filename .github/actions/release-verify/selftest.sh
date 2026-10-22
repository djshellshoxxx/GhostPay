#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
commit=0123456789abcdef0123456789abcdef01234567
mkdir "$tmp/ok"

digest() { sha256sum "$1" | awk '{print $1}'; }
manifest() {
  python3 - "$tmp/ok/release-manifest.json" "$commit" "$1" <<'PY'
import hashlib, json, os, sys
p, commit, name = sys.argv[1:]
b = open(os.environ["TMP_ROOT"] + "/ok/" + name, "rb").read()
json.dump({"schemaVersion": 1, "commit": commit, "checksumsFile": "SHA256SUMS",
           "artifacts": [{"name": name, "sha256": hashlib.sha256(b).hexdigest(), "bytes": len(b)}]}, open(p, "w"))
PY
}
sums() {
  printf '%s  %s\n' "$(digest "$tmp/ok/bundle.tgz")" bundle.tgz > "$tmp/ok/SHA256SUMS"
  printf '%s  %s\n' "$(digest "$tmp/ok/release-manifest.json")" release-manifest.json >> "$tmp/ok/SHA256SUMS"
}
verify() {
  GP_DIR="$tmp/ok" GP_SUMS=SHA256SUMS GP_MANIFEST=release-manifest.json GP_COMMIT="$commit" bash "$here/verify.sh" >/dev/null 2>&1
}
must_fail() { if verify; then echo "expected verifier rejection: $1" >&2; exit 1; fi; }

export TMP_ROOT="$tmp"
printf 'fake bundle\n' > "$tmp/ok/bundle.tgz"
manifest bundle.tgz
sums
verify

# JSON parser must reject duplicate member names instead of accepting a parser-dependent winner.
printf 'fake bundle\n' > "$tmp/ok/bundle.tgz"
python3 - "$tmp/ok/release-manifest.json" "$commit" <<'PY'
import hashlib, json, os, sys
p, commit = sys.argv[1:]
b = open(os.environ["TMP_ROOT"] + "/ok/bundle.tgz", "rb").read()
art = {"name": "bundle.tgz", "sha256": hashlib.sha256(b).hexdigest(), "bytes": len(b)}
with open(p, "w") as f:
    f.write('{"schemaVersion":0,"schemaVersion":1,"commit":%s,"checksumsFile":"SHA256SUMS","artifacts":[%s]}' % (json.dumps(commit), json.dumps(art)))
PY
sums
must_fail "duplicate JSON key"

# Tabs/newlines in a field cannot inject additional tab-separated manifest records.
manifest bundle.tgz
python3 - "$tmp/ok/release-manifest.json" <<'PY'
import json, sys
p = sys.argv[1]
m = json.load(open(p))
m["artifacts"][0]["name"] = "bundle.tgz\ncommit\t0123456789abcdef0123456789abcdef01234567"
json.dump(m, open(p, "w"))
PY
sums
must_fail "tab/newline injection"

manifest bundle.tgz
sums
printf '%s  %s\n' "$(digest "$tmp/ok/bundle.tgz")" bundle.tgz >> "$tmp/ok/SHA256SUMS"
must_fail "duplicate checksum entry"

manifest bundle.tgz
printf '%s  %s\n' "$(digest "$tmp/ok/bundle.tgz")" bundle.tgz > "$tmp/ok/SHA256SUMS"
printf '%s  %s\n' "$(digest "$tmp/ok/release-manifest.json")" release-manifest.json >> "$tmp/ok/SHA256SUMS"
printf 'extra\n' > "$tmp/ok/unmanifested.bin"
printf '%s  %s\n' "$(digest "$tmp/ok/unmanifested.bin")" unmanifested.bin >> "$tmp/ok/SHA256SUMS"
must_fail "checksum entry absent from manifest"

manifest bundle.tgz
sums
mv "$tmp/ok/bundle.tgz" "$tmp/ok/real-bundle.tgz"
ln -s real-bundle.tgz "$tmp/ok/bundle.tgz"
must_fail "symlink artifact"
echo 'release-verify selftest: ok'
