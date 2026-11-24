# Release-signing trust root

`allowed_signers` pins the public keys allowed to sign GhostPay release tags (`v*`). It is read by
`scripts/verify-tag.sh`, by the `verify` and `build` jobs of `.github/workflows/release.yml`, and by anyone verifying
a release (`docs/operators/release-and-verify.md`).

**Status: no key is pinned yet. Every release tag is rejected until the owner adds one.** This is deliberate
(fail closed): a trust root cannot be produced by automation; it is a human decision.

## Owner: add the release-signing key (human gate)

1. Generate the key on the machine or hardware token that will hold it, for example
   `ssh-keygen -t ed25519-sk -C ghostpay-release -f ~/.ssh/ghostpay_release` (FIDO token) or `-t ed25519`.
   The private key never enters this repository, CI secrets, or shared storage.
2. Append one line to `allowed_signers`:
   `<principal> namespaces="git" <contents of ~/.ssh/ghostpay_release.pub>`
   `<principal>` is a label (an e-mail address is conventional). `namespaces="git"` limits the key to git signatures.
3. Land the change on the default branch through a reviewed pull request. CI reads the copy on the default branch,
   so a key added only on a feature branch or inside the tagged commit is not trusted.
4. Publish the fingerprint (`ssh-keygen -lf ~/.ssh/ghostpay_release.pub`) through at least one channel independent of
   this repository, so users can detect a swapped trust root.
5. Sign with it: `git config gpg.format ssh`, `git config user.signingkey ~/.ssh/ghostpay_release.pub`, then
   `git tag -s vX.Y.Z -m "GhostPay vX.Y.Z"`.

Rotation and revocation: add the new key, release with it, then delete the old line (CI uses the default branch copy,
so deletion takes effect for the next run). `valid-before="YYYYMMDD"` bounds a key in time.

Recommended repository settings (not versioned, owner action): a ruleset or CODEOWNERS rule requiring owner review
for `.github/release-signers/**` and `scripts/verify-tag.sh`, and a tag ruleset restricting who may create `v*` tags.

## PGP (optional)

SSH signatures are preferred. To sign with OpenPGP instead, add the ASCII-armored public key(s) as `pgp-keys.asc` in
this directory (same review rules). `scripts/verify-tag.sh` verifies PGP-signed tags in a throw-away keyring that
contains only those keys and requires the signing primary fingerprint to be one of them.

## Check locally

```
git fetch origin tag vX.Y.Z
bash scripts/verify-tag.sh vX.Y.Z "$(git rev-parse 'vX.Y.Z^{commit}')"
```

As a user, prefer an `allowed_signers` file you built from the independently published fingerprint
(`--allowed-signers FILE`) over the copy inside the download you are checking.
