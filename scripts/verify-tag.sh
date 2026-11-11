#!/usr/bin/env bash
# Cryptographically verify a release tag against a PINNED trust root, and that it points at the expected commit.
#
# Usage: verify-tag.sh [--allowed-signers FILE] [--pgp-keys FILE] [--ancestor-of REF] <tag> <expected-commit>
#
#   --allowed-signers FILE  SSH allowed-signers file (ssh-keygen(1) ALLOWED SIGNERS format).
#                           Default: .github/release-signers/allowed_signers in this repository.
#   --pgp-keys FILE         Optional ASCII-armored OpenPGP public keys, used only for PGP-signed tags.
#                           Default: .github/release-signers/pgp-keys.asc (may be absent).
#   --ancestor-of REF       Also require <expected-commit> to be reachable from REF (e.g. refs/remotes/origin/main).
#
# Passes only if ALL hold:
#   * the tag name is a release tag (vMAJOR.MINOR.PATCH[-PRERELEASE]);
#   * refs/tags/<tag> is an ANNOTATED tag object (lightweight tags are rejected);
#   * the tag object's own "tag" header equals <tag> (a signed tag re-pushed under another name is rejected),
#     its "type" is commit and its "object" is <expected-commit>;
#   * it carries an SSH signature that `git verify-tag` accepts for a principal listed in the allowed-signers file
#     (minimum trust "fully"; "No principal matched" is a failure), or a PGP signature made by a key in --pgp-keys,
#     checked in a throw-away keyring that contains only those keys;
#   * with --ancestor-of: the commit is reachable from REF.
#
# Fails closed: an empty or missing trust root is an error. Adding the release-signing public key is a human step
# for the repository owner (.github/release-signers/README.md). Needs git >= 2.34 and ssh-keygen (OpenSSH >= 8.2)
# for SSH tags, gpg for PGP tags. Errors are printed as GitHub `::error::` annotations.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$here/.." && pwd)"
signers="$repo_root/.github/release-signers/allowed_signers"
pgp_keys="$repo_root/.github/release-signers/pgp-keys.asc"
ancestor_of=""

fail() { echo "::error::verify-tag: $*" >&2; exit 1; }
usage() { sed -n '4,10p' "$0" >&2; exit 2; }

while [ "$#" -gt 0 ]; do
  case "$1" in
    --allowed-signers) [ "$#" -ge 2 ] || usage; signers="$2"; shift 2 ;;
    --pgp-keys) [ "$#" -ge 2 ] || usage; pgp_keys="$2"; shift 2 ;;
    --ancestor-of) [ "$#" -ge 2 ] || usage; ancestor_of="$2"; shift 2 ;;
    -h|--help) usage ;;
    --) shift; break ;;
    -*) usage ;;
    *) break ;;
  esac
done
[ "$#" -eq 2 ] || usage
tag="$1"; want="$2"

if [[ ! "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z][0-9A-Za-z.-]*)?$ ]] || [[ "$tag" == *..* ]]; then
  fail "'$tag' is not a release tag name (expected vMAJOR.MINOR.PATCH[-PRERELEASE])"
fi
[[ "$want" =~ ^[0-9a-f]{40}$ ]] || fail "expected commit must be a full 40-hex SHA, got '$want'"
git rev-parse --git-dir >/dev/null 2>&1 || fail "not inside a git repository"

# Non-comment, non-blank lines.
key_lines() { [ -f "$1" ] || { echo 0; return; }; grep -cEv '^[[:space:]]*(#|$)' "$1" || true; }

# 1. Annotated tag that names itself and points at the expected commit.
ref="refs/tags/$tag"
git rev-parse --quiet --verify "$ref" >/dev/null || fail "tag $tag does not exist locally (fetch the tag object first)"
otype="$(git cat-file -t "$ref")"
[ "$otype" = "tag" ] || fail "$tag is a lightweight tag (points directly at a $otype); release tags must be signed annotated tags"
tag_obj="$(git rev-parse "$ref")"
header="$(git cat-file tag "$tag_obj" | sed '/^$/q')"
h_object="$(sed -n 's/^object //p' <<<"$header" | head -n1)"
h_type="$(sed -n 's/^type //p' <<<"$header" | head -n1)"
h_tag="$(sed -n 's/^tag //p' <<<"$header" | head -n1)"
[ "$h_tag" = "$tag" ] || fail "tag object $tag_obj is named '$h_tag' inside but was pushed as '$tag'"
[ "$h_type" = "commit" ] || fail "$tag points at a $h_type, not a commit"
[ "$h_object" = "$want" ] || fail "$tag points at commit $h_object, expected $want (the commit being built)"

# 2. Signature kind.
body="$(git cat-file tag "$tag_obj")"
if grep -q -- '-----BEGIN SSH SIGNATURE-----' <<<"$body"; then kind=ssh
elif grep -q -- '-----BEGIN PGP SIGNATURE-----' <<<"$body"; then kind=pgp
else fail "$tag is an annotated tag without a signature (use: git tag -s)"; fi

# Repository-local config must not be able to swap the verifier: pin every program and policy on the command line.
common=(-c gpg.minTrustLevel=fully -c gpg.ssh.program=ssh-keygen -c gpg.program=gpg -c gpg.openpgp.program=gpg)

if [ "$kind" = ssh ]; then
  n="$(key_lines "$signers")"
  if [ "$n" -eq 0 ]; then
    fail "no release-signing keys are pinned in $signers. The repository owner must add the release-signing SSH public key (human gate; see .github/release-signers/README.md). Refusing to accept $tag."
  fi
  command -v ssh-keygen >/dev/null 2>&1 || fail "ssh-keygen is required to verify SSH-signed tags"
  signers_abs="$(cd "$(dirname "$signers")" && pwd)/$(basename "$signers")"
  set +e
  out="$(git "${common[@]}" -c gpg.format=ssh -c gpg.ssh.allowedSignersFile="$signers_abs" verify-tag "$ref" 2>&1)"
  rc=$?
  set -e
  printf '%s\n' "$out" | sed 's/^/  git: /' >&2
  [ "$rc" -eq 0 ] || fail "SSH signature on $tag did not verify against $signers (git exit $rc)"
  grep -qi 'No principal matched' <<<"$out" && fail "$tag is signed by a key that is not in $signers"
  principal="$(sed -nE 's/^Good "git" signature for (.+) with [A-Za-z0-9-]+ key (SHA256:[A-Za-z0-9+\/=]+).*$/\1 (\2)/p' <<<"$out" | head -n1)"
  [ -n "$principal" ] || fail "could not confirm a pinned principal for $tag from git's output"
else
  [ -f "$pgp_keys" ] && grep -q -- '-----BEGIN PGP PUBLIC KEY BLOCK-----' "$pgp_keys" \
    || fail "$tag is PGP-signed but no release-signing PGP keys are pinned in $pgp_keys. The repository owner must add the release-signing public key (human gate; see .github/release-signers/README.md)."
  command -v gpg >/dev/null 2>&1 || fail "gpg is required to verify PGP-signed tags"
  gh="$(mktemp -d "${TMPDIR:-/tmp}/gpvt.XXXXXX")"
  # shellcheck disable=SC2064  # expand now: the path is fixed
  trap "rm -rf '$gh'" EXIT
  chmod 700 "$gh"
  GNUPGHOME="$gh" gpg --batch --quiet --no-autostart --import "$pgp_keys" >/dev/null 2>&1 || fail "could not import $pgp_keys"
  pinned="$(GNUPGHOME="$gh" gpg --batch --no-autostart --with-colons --fingerprint 2>/dev/null \
    | awk -F: '$1=="pub"{p=1;next} $1=="fpr"&&p{print $10;p=0}')"
  [ -n "$pinned" ] || fail "no public keys found in $pgp_keys"
  # Only pinned keys are in this keyring; mark them fully trusted so gpg.minTrustLevel=fully can pass for them.
  while read -r f; do printf '%s:6:\n' "$f"; done <<<"$pinned" | GNUPGHOME="$gh" gpg --batch --quiet --no-autostart --import-ownertrust >/dev/null 2>&1
  set +e
  out="$(GNUPGHOME="$gh" git "${common[@]}" verify-tag --raw "$ref" 2>&1)"
  rc=$?
  set -e
  printf '%s\n' "$out" | sed 's/^/  gpg: /' >&2
  [ "$rc" -eq 0 ] || fail "PGP signature on $tag did not verify against $pgp_keys (git exit $rc)"
  grep -qE '^\[GNUPG:\] (BADSIG|ERRSIG|EXPSIG|EXPKEYSIG|REVKEYSIG)' <<<"$out" && fail "PGP signature on $tag is bad, expired or revoked"
  grep -qE '^\[GNUPG:\] GOODSIG ' <<<"$out" || fail "no good PGP signature on $tag"
  primary="$(awk '$1=="[GNUPG:]" && $2=="VALIDSIG" {print $NF; exit}' <<<"$out")"
  grep -qxF "$primary" <<<"$pinned" || fail "$tag is signed by $primary, which is not a pinned key"
  principal="PGP $primary"
fi

# 3. Optional: the commit must be on a protected branch.
if [ -n "$ancestor_of" ]; then
  git rev-parse --quiet --verify "$ancestor_of^{commit}" >/dev/null || fail "ref $ancestor_of not found"
  git merge-base --is-ancestor "$want" "$ancestor_of" || fail "commit $want is not reachable from $ancestor_of"
fi

echo "OK: $tag (tag object $tag_obj) is signed by pinned signer $principal and points at commit $want${ancestor_of:+, reachable from $ancestor_of}"
