#!/usr/bin/env bash
# Self-test for deploy/selfhost.sh: archive validation (dry-run) and the release authenticity gate before anything is
# extracted or started (audit L7-M2). Needs bash, python3, tar and sha256sum; no Docker, no network: a fake `docker`
# and `gh` on PATH record their calls, and selfhost.sh runs from a scratch copy of the repository layout it needs.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
commit=0123456789abcdef0123456789abcdef01234567
failures=0
out=""
# fail <message>: record a failure and show the end of the last selfhost.sh output.
fail() {
  echo "FAIL: $*" >&2
  if [ -n "$out" ]; then tail -n 3 <<<"$out" | sed 's/^/      /' >&2; fi
  failures=$((failures + 1))
}
sha256() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'; else shasum -a 256 "$1" | awk '{print $1}'; fi; }

python3 - "$tmp/safe.tar.gz" "$tmp/link.tar.gz" "$tmp/traversal.tar.gz" <<'PY'
import io, sys, tarfile

def add_file(tf, name, data):
    info = tarfile.TarInfo(name)
    info.size = len(data)
    tf.addfile(info, io.BytesIO(data))

with tarfile.open(sys.argv[1], "w:gz") as tf:
    root = tarfile.TarInfo("web/")
    root.type = tarfile.DIRTYPE
    tf.addfile(root)
    add_file(tf, "web/index.html", b"safe")

with tarfile.open(sys.argv[2], "w:gz") as tf:
    root = tarfile.TarInfo("web/")
    root.type = tarfile.DIRTYPE
    tf.addfile(root)
    link = tarfile.TarInfo("web/pivot")
    link.type = tarfile.SYMTYPE
    link.linkname = "../../outside"
    tf.addfile(link)
    add_file(tf, "web/index.html", b"unsafe")

with tarfile.open(sys.argv[3], "w:gz") as tf:
    add_file(tf, "web/../outside", b"unsafe")
PY

# 1. Archive validation in --dry-run (unchanged behaviour; the gate arguments are now required with --tarball).
: > "$tmp/SHA256SUMS"
printf '{"commit":"%s","artifacts":[]}\n' "$commit" > "$tmp/release-manifest.json"
any_sha=0000000000000000000000000000000000000000000000000000000000000000
dry() { "$here/selfhost.sh" --dry-run --tarball "$1" --sums "$tmp/SHA256SUMS" --commit "$commit" --manifest "$tmp/release-manifest.json" --expect-sha256 "$any_sha" --env-file "$tmp/missing.env" 2>&1 || true; }
grep -q 'tarball contains only safe web files' <<<"$(dry "$tmp/safe.tar.gz")" || fail 'safe archive rejected'
grep -q 'tarball structure is unsafe' <<<"$(dry "$tmp/link.tar.gz")" || fail 'link archive was not rejected'
grep -q 'tarball structure is unsafe' <<<"$(dry "$tmp/traversal.tar.gz")" || fail 'traversal archive was not rejected'
printf 'GHOSTPAY_WEB_DIST=../outside\n' > "$tmp/bad.env"
output="$("$here/selfhost.sh" --dry-run --env-file "$tmp/bad.env" 2>&1 || true)"
grep -q 'GHOSTPAY_WEB_DIST must resolve to a child of deploy/' <<<"$output" || fail 'external web bundle path was not rejected'

# 2. A release whose prerequisites all pass, in a scratch copy of the layout selfhost.sh needs.
fake="$tmp/repo"
mkdir -p "$fake/deploy/config" "$fake/deploy/secrets" "$fake/scripts" "$tmp/bin" "$tmp/rel"
cp "$here/selfhost.sh" "$fake/deploy/selfhost.sh"
cp "$here/../scripts/verify-release.sh" "$fake/scripts/verify-release.sh"
printf 'services: {}\n' > "$fake/deploy/docker-compose.yml"
printf 'GHOSTPAY_PUBLIC_ORIGIN=https://pay.example.invalid\n' > "$fake/deploy/.env"
printf '{"allowedOrigins":["https://pay.example.invalid"]}\n' > "$fake/deploy/config/relayer.config.json"
for s in relayer_key quote_secret; do printf 'x' > "$fake/deploy/secrets/$s"; chmod 600 "$fake/deploy/secrets/$s"; done
printf '#!/usr/bin/env bash\necho "docker $*" >> "$SELFTEST_LOG"\n' > "$tmp/bin/docker"
printf '#!/usr/bin/env bash\necho "gh $*" >> "$SELFTEST_LOG"\nexit "${SELFTEST_GH_EXIT:-0}"\n' > "$tmp/bin/gh"
chmod +x "$tmp/bin/docker" "$tmp/bin/gh"
tar_name=ghostpay-web-v0.0.1.tar.gz
cp "$tmp/safe.tar.gz" "$tmp/rel/$tar_name"
tar_sha="$(sha256 "$tmp/rel/$tar_name")"
printf '%s  %s\n' "$tar_sha" "$tar_name" > "$tmp/rel/SHA256SUMS"
printf '{"commit":"%s","artifacts":[{"kind":"web-bundle-tarball","sha256":"%s"}]}\n' "$commit" "$tar_sha" > "$tmp/rel/release-manifest.json"
dist="$fake/deploy/web-dist"
log="$tmp/calls.log"

# run <stdin> <args...>: run the scratch selfhost.sh (not --dry-run) with the fake tools; sets $out and $code.
run() {
  printf '%s' "$1" > "$tmp/stdin"
  shift
  : > "$log"
  code=0
  out="$(PATH="$tmp/bin:$PATH" SELFTEST_LOG="$log" bash "$fake/deploy/selfhost.sh" "$@" < "$tmp/stdin" 2>&1)" || code=$?
}
release=(--tarball "$tmp/rel/$tar_name" --sums "$tmp/rel/SHA256SUMS" --commit "$commit" --manifest "$tmp/rel/release-manifest.json")
nothing_changed() { # label
  [ ! -e "$dist" ] || fail "$1: the web bundle directory was written"
  if grep -q 'compose.* up -d' "$log"; then fail "$1: services were started"; fi
}
# attested <label>: exactly one gh call, on the private copy, bound to release.yml at the tag, the --commit and
# GitHub-hosted runners (review E-R2).
attested() {
  local calls copy
  calls="$(grep '^gh ' "$log" || true)"
  copy="$(awk '{ print $4 }' <<<"$calls")"
  [ "$(awk '{ $4 = "FILE"; print }' <<<"$calls")" = "gh attestation verify FILE --repo owner/repo --signer-workflow owner/repo/.github/workflows/release.yml --source-ref refs/tags/v0.0.1 --source-digest $commit --deny-self-hosted-runners" ] \
    && [ "${copy##*/}" = "$tar_name" ] && [ "$copy" != "$tmp/rel/$tar_name" ] \
    || fail "$1: gh attestation verify not called exactly once with the release workflow, tag, commit and hosted-runner flags: ${calls:-no call}"
}

run 'yes
' --tarball "$tmp/rel/$tar_name" --sums "$tmp/rel/SHA256SUMS" --commit "$commit" --expect-sha256 "$tar_sha"
[ "$code" -ne 0 ] && grep -q -- '--manifest' <<<"$out" || fail "no --manifest: not refused (exit $code)"
nothing_changed 'no --manifest'

run 'yes
' "${release[@]}"
[ "$code" -ne 0 ] && grep -q 'authenticity check' <<<"$out" || fail "no --expect-sha256/--attest-repo: not refused (exit $code)"
nothing_changed 'no authenticity check'

run 'yes
' "${release[@]}" --expect-sha256 ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
[ "$code" -ne 0 ] && grep -q 'does not match --expect-sha256' <<<"$out" || fail "wrong --expect-sha256: not refused (exit $code)"
nothing_changed 'wrong --expect-sha256'

run 'yes
' --tarball "$tmp/rel/$tar_name" --sums "$tmp/rel/SHA256SUMS" --commit aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --manifest "$tmp/rel/release-manifest.json" --expect-sha256 "$tar_sha"
[ "$code" -ne 0 ] && grep -q 'manifest commit' <<<"$out" || fail "commit not compared with the manifest (exit $code)"
nothing_changed 'commit mismatch'

SELFTEST_GH_EXIT=1 run 'yes
' "${release[@]}" --attest-repo owner/repo --tag v0.0.1
[ "$code" -ne 0 ] || fail 'failed gh attestation verify: not refused'
attested 'failed attestation'
nothing_changed 'failed attestation'

run 'yes
' --tarball "$tmp/rel/$tar_name" --sums "$tmp/rel/SHA256SUMS" --commit 0123456789ABCDEF0123456789ABCDEF01234567 --manifest "$tmp/rel/release-manifest.json" --attest-repo owner/repo --tag v0.0.1
[ "$code" -ne 0 ] && grep -q -- '--commit must be a full 40-hex SHA' <<<"$out" || fail "upper-case --commit: not refused (exit $code)"
if grep -q '^gh ' "$log"; then fail 'upper-case --commit: gh was called'; fi
nothing_changed 'upper-case --commit'

run '' "${release[@]}" --expect-sha256 "$tar_sha" --yes
[ "$code" -eq 0 ] || fail "verified release with --yes: exit $code"
[ "$(cat "$dist/index.html" 2>/dev/null)" = safe ] || fail 'verified bundle not installed'
if grep -q 'compose.* up -d' "$log"; then fail '--yes started a bundle installed in the same run'; fi
grep -q 'then run: deploy/selfhost.sh$' <<<"$out" || fail 'rerun hint with the default env file'

# The rerun hint keeps a non-default --env-file, shell-quoted (review E-R4).
cp "$fake/deploy/.env" "$fake/deploy/my env.env"
run '' "${release[@]}" --expect-sha256 "$tar_sha" --yes --onion --env-file "$fake/deploy/my env.env"
[ "$code" -eq 0 ] && grep -qF "then run: deploy/selfhost.sh --onion --env-file $(printf %q "$fake/deploy/my env.env")" <<<"$out" \
  || fail "rerun hint drops --env-file (exit $code)"

rm -rf "$dist"
run 'yes
no
' "${release[@]}" --expect-sha256 "$tar_sha"
[ "$code" -eq 0 ] && [ -f "$dist/index.html" ] || fail "interactive install: exit $code"
if grep -q 'compose.* up -d' "$log"; then fail 'started without the second confirmation'; fi

run 'yes
start
' "${release[@]}" --attest-repo owner/repo --tag v0.0.1
[ "$code" -eq 0 ] && grep -q 'compose.* up -d' "$log" || fail "confirmed start after a verified attestation did not start (exit $code)"
attested 'verified attestation'

run '' --yes
[ "$code" -eq 0 ] && grep -q 'compose.* up -d' "$log" || fail "re-run without --tarball did not start the installed bundle (exit $code)"

if [ "$failures" -gt 0 ]; then echo "selfhost selftest: $failures failure(s)" >&2; exit 1; fi
echo 'selfhost selftest: ok'
