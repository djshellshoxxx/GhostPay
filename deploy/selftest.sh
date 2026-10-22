#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
tmp="$(mktemp -d)"
commit=0123456789abcdef0123456789abcdef01234567
: > "$tmp/SHA256SUMS"

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

output="$("$here/selfhost.sh" --dry-run --tarball "$tmp/safe.tar.gz" --sums "$tmp/SHA256SUMS" --commit "$commit" --env-file "$tmp/missing.env" 2>&1 || true)"
grep -q 'tarball contains only safe web files' <<<"$output" || { echo 'safe archive rejected' >&2; exit 1; }
output="$("$here/selfhost.sh" --dry-run --tarball "$tmp/link.tar.gz" --sums "$tmp/SHA256SUMS" --commit "$commit" --env-file "$tmp/missing.env" 2>&1 || true)"
grep -q 'tarball structure is unsafe' <<<"$output" || { echo 'link archive was not rejected' >&2; exit 1; }
output="$("$here/selfhost.sh" --dry-run --tarball "$tmp/traversal.tar.gz" --sums "$tmp/SHA256SUMS" --commit "$commit" --env-file "$tmp/missing.env" 2>&1 || true)"
grep -q 'tarball structure is unsafe' <<<"$output" || { echo 'traversal archive was not rejected' >&2; exit 1; }
printf 'GHOSTPAY_WEB_DIST=../outside\n' > "$tmp/bad.env"
output="$("$here/selfhost.sh" --dry-run --env-file "$tmp/bad.env" 2>&1 || true)"
grep -q 'GHOSTPAY_WEB_DIST must resolve to a child of deploy/' <<<"$output" || { echo 'external web bundle path was not rejected' >&2; exit 1; }
echo 'selfhost archive selftest: ok'
