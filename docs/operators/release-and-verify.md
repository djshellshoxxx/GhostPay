# Releasing and verifying GhostPay

Audience: maintainers who cut releases, and end users who want to check what they are running.
Evidence level: historical script/actionlint/shellcheck checks are documented below. On 2026-11-10 the
unmerged integration PR #98 at `364b1f185fcc2adaedab4ce7b4b14e676b1da3b7` had 34 successful
GitHub-hosted checks, including CI, Integration, Hosting kit and CLI. This is **not** evidence that the
signed-tag **release workflow** has executed or that a release is authorized (see section 6).

Related: `docs/SECURITY_QA_DEVOPS_PLAYBOOK.md` section 2 (pipeline, release manifest),
`docs/audits/03-security-review-client-relayer.md` S3-04 and S3-17.

## 1. What the pipeline does and does not do

| Workflow | Trigger | Purpose |
|---|---|---|
| `.github/workflows/ci.yml` | PR, push to `main` | typecheck, lint, tests (relayer anvil e2e required), web build, Playwright `e2e` job, forge fmt/build/test/`snapshot --check`/coverage (lcov artifact), NatSpec, Slither, secret scan, "all actions pinned" check |
| `.github/workflows/nightly.yml` | 03:17 UTC daily, manual | forge fuzz at 100 000 runs, Slither, dependency audit, reproducibility diff, Echidna harnesses, Mythril (Echidna/Mythril install steps are unverified until a green nightly run; see `docs/developer/ci.md`) |
| `.github/workflows/release.yml` | tag `v*` | tag signature verified against the pinned trust root, tests, deterministic build, SBOM, `SHA256SUMS`, manifest, provenance attestation, **draft** GitHub release |

Hosting is **intentionally not enabled**: there are no IPFS, ENS, Tor or Pages steps. `release.yml` ends with a
commented-out, `if: false` stub documenting what an owner decision would have to cover. Do not enable it without a
written decision (record it under `docs/adr/`).

## 2. Maintainers: cut a release

One-time setup (repository settings, not versioned):

1. Create the GitHub Environment `release` with **Required reviewers**. The `build` and `draft-release` jobs reference
   it, so each waits for approval (two approvals per release).
2. Protect `v*` tags (tag ruleset) so only maintainers can create them.
3. **Owner (human gate): pin the release-signing key.** Add the SSH public key to
   `.github/release-signers/allowed_signers` through a reviewed PR to the default branch, and publish its fingerprint
   through a channel independent of this repository (`.github/release-signers/README.md`). The file ships with no
   key, so until this is done **every release run fails closed** at the tag check. PGP is supported as a fallback
   via `.github/release-signers/pgp-keys.asc`.
4. Recommended: require owner review for `.github/release-signers/**` and `scripts/verify-tag.sh` (ruleset or
   CODEOWNERS), and restrict `v*` tag creation (step 2).

Per release:

1. Make sure `main` is green (CI and the latest nightly) and `docs/audits` open findings are acknowledged in the notes.
2. Create a **signed, annotated** tag on the commit: `git tag -s v1.2.3 -m "GhostPay v1.2.3"` then
   `git push origin v1.2.3`. (`git tag -v v1.2.3` locally first.)
3. `release.yml` runs `verify`. Its first step runs `scripts/verify-tag.sh` **taken from the default branch**, with
   the trust root **from the default branch** (not from the tagged commit). It cryptographically verifies the tag
   (`git verify-tag` with `gpg.ssh.allowedSignersFile`, minimum trust `fully`; an unknown key is a failure) and
   checks that the tag is annotated, names itself `$TAG`, points at the checked-out commit, and that this commit is
   reachable from the default branch. Then tests, scans and `node --test scripts/tests/release-*.test.mjs` run.
4. Approve the `release` environment when prompted for `build`. It **re-verifies the tag** (it may have moved while
   waiting for approval), runs `scripts/release-build.sh` with `GP_REQUIRE_RELEASE=1` (fails unless the manifest
   channel is `release`), self-checks the output with `scripts/verify-release.sh`, and attests the artifacts.
5. Approve again for `draft-release`. It checks that `refs/tags/$TAG` is still the tag object verified in `build`
   and points at the manifest commit, then creates a **draft** release. Nothing is published.
6. Run the release-candidate procedure on a separate machine
   (`docs/operators/release-candidate-qualification.md`). Only then publish the draft manually (human gate).

Local dry run (no GitHub): `bash scripts/release-build.sh` (needs network for `npm ci`, or `GP_SKIP_INSTALL=1` after
`npm ci`), then `bash scripts/repro-check.sh --head` to confirm two clean builds in different directories are
byte-identical. A local build is labelled `"channel": "development"` unless it is built from a clean tree at a commit
that carries the git tag named by `VERSION`; `verify-release.sh` rejects development manifests.

### Artifacts

| File | What it is |
|---|---|
| `ghostpay-web-<tag>.tar.gz` | `apps/web/dist` as one top-level directory `ghostpay-web/`. Deterministic: sorted names, owner 0, mtime = tag commit time, `gzip -n`. |
| `SHA256SUMS` | sha256 of the tarball, SBOM and manifest, in `sha256sum -c` format. |
| `sbom.cdx.json` | CycloneDX SBOM from `npm sbom --omit dev` (production dependency tree). Serial number and timestamp are normalised from the lockfile digest / commit time, and the root component name (npm uses the checkout directory name) from `package.json`, so it is reproducible. |
| `release-manifest.json` | `channel` (`release` or `development`, with `channelReasons`), `sourceTree` (clean flag, tag commit at build time), commit, tag, `SOURCE_DATE_EPOCH`, tool versions, lockfile digest, artifact hashes, deployment manifests found in `deployments/`, CI run URL, and explicit `not-recorded` entries (IPFS CID, onion hash, source verification, audit summaries). Tool versions differ per machine, so the manifest is not part of the reproducibility comparison. |
| Attestation | GitHub build-provenance attestation over every line in `SHA256SUMS`, created by `actions/attest-build-provenance` using the workflow's OIDC identity. Stored by GitHub, not in the release assets. |

Manifest `channel` rule (`scripts/gen-release-manifest.mjs`): `release` only if `VERSION` is a release tag name
(`vX.Y.Z[-pre]`), `refs/tags/$VERSION` existed at build time and resolved to the built commit, and the tree was clean
(no modified or untracked files outside the output directory, `HEAD` equal to the recorded commit). Otherwise
`development`. The schema stays `schemaVersion: 1`; fields were only added.

How trust fits together: the **signed tag** says a maintainer vouches for a commit; the **attestation** says GitHub's
runner built these exact bytes from that repository and workflow; **SHA256SUMS** lets you check your download matches;
**reproducibility** lets you check the bytes come from the source without trusting the runner.

## 3. End users: verify on a separate machine

Use a machine and network other than the one that serves or runs the app.

1. Get the maintainers' public key fingerprint from an independent channel (not the same page as the download), and
   write your own allowed-signers file from it: `<principal> namespaces="git" ssh-ed25519 AAAA...` (compare
   `ssh-keygen -lf` of that key with the published fingerprint).
2. Clone the source and verify the tag:
   ```
   git clone <repo-url> ghostpay && cd ghostpay
   git fetch --tags
   commit="$(git rev-parse 'v1.2.3^{commit}')"
   bash scripts/verify-tag.sh --allowed-signers ~/ghostpay_allowed_signers v1.2.3 "$commit"
   ```
   It must print `OK: v1.2.3 ... signed by pinned signer ...`. Equivalent by hand:
   `git -c gpg.ssh.allowedSignersFile=$HOME/ghostpay_allowed_signers -c gpg.minTrustLevel=fully verify-tag v1.2.3`
   (must say `Good "git" signature for <principal>`; "No principal matched" means the key is not the pinned one).
   Also compare your file with `.github/release-signers/allowed_signers` at the tag: a difference is a red flag.
3. Download `ghostpay-web-v1.2.3.tar.gz`, `SHA256SUMS`, `sbom.cdx.json`, `release-manifest.json` into one directory.
4. Run the checker with the commit from step 2 (needs bash >= 4, tar, sha256sum or shasum, node or python3):
   ```
   bash scripts/verify-release.sh ghostpay-web-v1.2.3.tar.gz SHA256SUMS "$commit" release-manifest.json
   ```
   It fails on any of: a hash mismatch of tarball, SBOM or manifest against `SHA256SUMS` or the manifest; a
   `SHA256SUMS` that omits the manifest or the SBOM, or lists files the manifest does not; a missing manifest or
   SBOM; a manifest commit other than `$commit`; a manifest version that does not match the tarball name or is not
   a release tag; a manifest whose `channel` is not `release` (development builds, and manifests from before the
   channel field existed); an archive with absolute paths, `..`, symlinks, hardlinks or special files, anything
   outside the `ghostpay-web/` top-level directory, source maps, or no `index.html`. Then it prints the remaining
   manual checklist. The manifest argument is required (audit L7-M2): a 3-argument call is a usage error.
5. Verify the attestation, pinned to the tag and the release workflow:
   ```
   gh attestation verify ghostpay-web-v1.2.3.tar.gz --repo <owner>/<repo> \
     --source-ref refs/tags/v1.2.3 --signer-workflow <owner>/<repo>/.github/workflows/release.yml \
     --source-digest "$commit" --deny-self-hosted-runners
   ```
   `--repo` alone accepts an attestation from any workflow or ref in the repository; `--source-digest` ties it to the
   commit the signed tag points at. In a workflow, the composite action `.github/actions/release-verify` runs this
   same pinned command when given `verify-attestation: 'true'`, `tag: v1.2.3` and `expected-commit: <40-hex-commit>`;
   it fails if `tag` is missing or not a plain release tag.
6. Optional but strongest: rebuild at the tag with `VERSION=v1.2.3 bash scripts/release-build.sh` and compare the
   tarball sha256 with the release. Reproducibility is only claimed for the same Node/npm major and a Linux GNU
   toolchain; it has not been tested across operating systems.
7. Compare what your host **serves**: extract the tarball and `sha256sum` each file, then fetch each served file with
   `curl` from another machine and compare. Compare `deployments/*.json` addresses (router, announcer, fee recipient)
   with addresses published through an independent channel and with what your wallet shows.

### What the in-app release-hash widget can and cannot prove (audit S3-04)

The widget (`apps/web/src/lib/release.ts`) fetches the app's entry script from the **same origin** and hashes it.

- It can detect an accidental mismatch (stale cache, partial deploy) when the host is honest.
- It **cannot** detect a compromised or malicious host or mirror. The widget is part of the bundle that host serves,
  so it can print any "expected" hash, and the host can return the genuine bytes for the re-fetch while serving
  altered code to the page.
- It does not cover files other than the entry script, nor `deployments/*.json` loaded at runtime.

Treat it as informational. Authenticity comes only from the external steps above, done from a separate machine.
Until the pinning of router/fee-recipient into the hashed bundle (S3-01) is fixed, a tampered manifest is not
caught by any of this; check addresses independently.

## 4. Scripts

| Script | Use |
|---|---|
| `scripts/release-build.sh` | Deterministic build and packaging (`npm ci --ignore-scripts`, `build:libs`, web build with bundle scan, tar, SBOM, manifest, `SHA256SUMS`). |
| `scripts/repro-check.sh [--head\|--worktree]` | Two builds in separate clean directories; non-zero exit and a file diff on any difference. |
| `scripts/verify-release.sh` | End-user verification of a downloaded release (see above). |
| `scripts/verify-tag.sh` | Cryptographic tag verification against a pinned trust root (`.github/release-signers/`), plus tag-to-commit binding and optional `--ancestor-of`. Used by `release.yml`. |
| `scripts/tests/release-*.test.mjs` | `node --test` coverage for the scripts above (fake release in a temp dir; throw-away SSH/PGP keys). |
| `scripts/check-actions-pinned.sh` | Fails unless every `uses:` is a 40-hex SHA with a `# vX.Y.Z` comment. |
| `scripts/scan-secrets.sh` | Committed env-file and key-material scan (used by CI and release). |
| `scripts/gen-release-manifest.mjs`, `scripts/normalize-sbom.mjs` | Helpers for `release-build.sh`. |

Updating a pinned action: `git ls-remote --tags --refs https://github.com/<owner>/<repo>` to find the SHA of the
reviewed tag, replace the SHA, update the `# vX.Y.Z` comment, run `scripts/check-actions-pinned.sh`. Dependabot
(`.github/dependabot.yml`) proposes these weekly, grouped.

## 5. Open gaps (not faked)

- **Mutation testing, mainnet-fork tests**: no harness or config exists (audit O-07, G-14). The nightly workflow does
  not contain placeholder steps for them. Echidna and Mythril jobs exist in `nightly.yml` but have not yet had a green
  run on the hosted runner.
- **Testnet deployment job and deployment-manifest signing** (O-08, O-13): not implemented.
- **IPFS / ENS / Tor / Pages publication** (O-11): intentionally disabled.
- **Release-signing key**: `.github/release-signers/allowed_signers` contains no key yet, so every release run fails
  at the tag check until the owner adds one (human gate). The fingerprint must also be published out of band.
- **Workflow-level trust**: a tag workflow runs the `release.yml` of the tagged commit. The default-branch verifier
  and trust root, the ancestry check, tag rulesets and the `release` environment reviewers together are what stop
  an unreviewed commit; users should verify the tag themselves (section 3) and pin the attestation with
  `--source-ref`/`--signer-workflow`/`--source-digest`.
- **Dependency review on PRs and CODEOWNERS**: not qualified here (CODEOWNERS needs real owners). CodeQL **was observed passing** on #98 exact-head GitHub checks; it does not substitute for unresolved SonarCloud or independent review.
- **Relayer Docker image** is not built, scanned, or attested by these workflows.
- Hash-pinning of router/fee-recipient into the bundle (S3-01) is an application fix outside this pipeline.

## 6. Unverified

CI and integration workflows **have run** on GitHub for the exact draft #98 source:
[CI 42734552608](https://github.com/djshellshoxxx/GhostPay/actions/runs/42734552608),
[Integration 42734552235](https://github.com/djshellshoxxx/GhostPay/actions/runs/42734552235),
[Hosting kit 42734552338](https://github.com/djshellshoxxx/GhostPay/actions/runs/42734552338), and
[CLI 42734552538](https://github.com/djshellshoxxx/GhostPay/actions/runs/42734552538).
This does **not** mean the signed-tag `release.yml` workflow has completed a real release. Historical action
SHAs were resolved through `git ls-remote` tag listings, not independently re-checked on another path.
The signed-tag presence check in `release.yml` has not been qualified on a real tag push; reproducibility
was historically checked on one Linux host only. Later changes require exact-head requalification.
The unresolved SonarCloud D gate from parent #84 is **not** cleared by the green #98 GitHub jobs.
The tag-verification steps in `release.yml` (annotated-tag and default-branch fetch with the workflow token, the
`gh api` re-check in `draft-release`) are untested on a real tag push. `scripts/verify-tag.sh` was exercised locally
for PGP and for every non-cryptographic rejection; its SSH cases need `ssh-keygen` and run in the release `verify`
job (`node --test scripts/tests/release-*.test.mjs`).
