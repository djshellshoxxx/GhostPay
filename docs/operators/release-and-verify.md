# Releasing and verifying GhostPay

Audience: maintainers who cut releases, and end users who want to check what they are running.
Evidence level: workflows and scripts are checked by `actionlint`, `shellcheck`, and local runs. The workflows
have **not** been observed running on GitHub (see "Unverified" at the end).

Related: `docs/SECURITY_QA_DEVOPS_PLAYBOOK.md` section 2 (pipeline, release manifest),
`docs/audits/03-security-review-client-relayer.md` S3-04 and S3-17.

## 1. What the pipeline does and does not do

| Workflow | Trigger | Purpose |
|---|---|---|
| `.github/workflows/ci.yml` | PR, push to `main` | typecheck, lint, tests (relayer anvil e2e required), web build, Playwright `e2e` job, forge fmt/build/test/`snapshot --check`/coverage (lcov artifact), NatSpec, Slither, secret scan, "all actions pinned" check |
| `.github/workflows/nightly.yml` | 03:17 UTC daily, manual | forge fuzz at 100 000 runs, Slither, dependency audit, reproducibility diff |
| `.github/workflows/release.yml` | tag `v*` | verify, deterministic build, SBOM, `SHA256SUMS`, manifest, provenance attestation, **draft** GitHub release |

Hosting is **intentionally not enabled**: there are no IPFS, ENS, Tor or Pages steps. `release.yml` ends with a
commented-out, `if: false` stub documenting what an owner decision would have to cover. Do not enable it without a
written decision (record it under `docs/adr/`).

## 2. Maintainers: cut a release

One-time setup (repository settings, not versioned):

1. Create the GitHub Environment `release` with **Required reviewers**. The `build` and `draft-release` jobs reference
   it, so each waits for approval (two approvals per release).
2. Protect `v*` tags (tag ruleset) so only maintainers can create them.
3. Register your signing key (GPG or SSH) with your Git config and publish the public key and fingerprint through
   channels independent of this repository's download page.

Per release:

1. Make sure `main` is green (CI and the latest nightly) and `docs/audits` open findings are acknowledged in the notes.
2. Create a **signed, annotated** tag on the commit: `git tag -s v1.2.3 -m "GhostPay v1.2.3"` then
   `git push origin v1.2.3`. (`git tag -v v1.2.3` locally first.)
3. `release.yml` runs `verify`; it fails if the tag is lightweight or has no signature block. CI can only confirm a
   signature is *present*, not valid; validity is checked by humans (section 3).
4. Approve the `release` environment when prompted for `build`. It runs `scripts/release-build.sh`, checks the hashes,
   and attests the artifacts.
5. Approve again for `draft-release`. It creates a **draft** release with all artifacts. Nothing is published.
6. Download the draft's files to a separate machine and run `scripts/verify-release.sh` (section 3). Only then publish
   the draft manually.

Local dry run (no GitHub): `VERSION=v0.0.0-test bash scripts/release-build.sh` (needs network for `npm ci`), then
`bash scripts/repro-check.sh --worktree` to confirm two clean builds in different directories are byte-identical.

### Artifacts

| File | What it is |
|---|---|
| `ghostpay-web-<tag>.tar.gz` | `apps/web/dist` as one top-level directory `ghostpay-web/`. Deterministic: sorted names, owner 0, mtime = tag commit time, `gzip -n`. |
| `SHA256SUMS` | sha256 of the tarball, SBOM and manifest, in `sha256sum -c` format. |
| `sbom.cdx.json` | CycloneDX SBOM from `npm sbom --omit dev` (production dependency tree). Serial number and timestamp are normalised from the lockfile digest / commit time so it is reproducible. |
| `release-manifest.json` | Commit, tag, `SOURCE_DATE_EPOCH`, tool versions, lockfile digest, artifact hashes, deployment manifests found in `deployments/`, CI run URL, and explicit `not-recorded` entries (IPFS CID, onion hash, source verification, audit summaries). Tool versions differ per machine, so the manifest is not part of the reproducibility comparison. |
| Attestation | GitHub build-provenance attestation over every line in `SHA256SUMS`, created by `actions/attest-build-provenance` using the workflow's OIDC identity. Stored by GitHub, not in the release assets. |

How trust fits together: the **signed tag** says a maintainer vouches for a commit; the **attestation** says GitHub's
runner built these exact bytes from that repository and workflow; **SHA256SUMS** lets you check your download matches;
**reproducibility** lets you check the bytes come from the source without trusting the runner.

## 3. End users: verify on a separate machine

Use a machine and network other than the one that serves or runs the app.

1. Get the maintainers' public key fingerprint from an independent channel (not the same page as the download).
2. Clone the source and verify the tag:
   ```
   git clone <repo-url> ghostpay && cd ghostpay
   git fetch --tags
   git verify-tag v1.2.3          # must report a good signature from the expected fingerprint
   git rev-parse v1.2.3^{commit}  # note this 40-hex commit
   ```
   For SSH-signed tags configure `gpg.ssh.allowedSignersFile` first.
3. Download `ghostpay-web-v1.2.3.tar.gz`, `SHA256SUMS`, `sbom.cdx.json`, `release-manifest.json` into one directory.
4. Run the checker with the commit from step 2:
   ```
   bash scripts/verify-release.sh ghostpay-web-v1.2.3.tar.gz SHA256SUMS <40-hex-commit> release-manifest.json
   ```
   It checks hashes, manifest commit, and archive sanity, then prints the remaining manual checklist. Without the
   script: `sha256sum -c SHA256SUMS`.
5. Verify the attestation, bound to the release workflow, the tag and the commit the signed tag points at:
   `gh attestation verify ghostpay-web-v1.2.3.tar.gz --repo <owner>/<repo> --signer-workflow <owner>/<repo>/.github/workflows/release.yml --source-ref refs/tags/v1.2.3 --source-digest <40-hex-commit> --deny-self-hosted-runners`.
   `--repo` alone accepts an attestation from any workflow or ref in the repository.
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
| `scripts/check-actions-pinned.sh` | Fails unless every `uses:` is a 40-hex SHA with a `# vX.Y.Z` comment. |
| `scripts/scan-secrets.sh` | Committed env-file and key-material scan (used by CI and release). |
| `scripts/gen-release-manifest.mjs`, `scripts/normalize-sbom.mjs` | Helpers for `release-build.sh`. |

Updating a pinned action: `git ls-remote --tags --refs https://github.com/<owner>/<repo>` to find the SHA of the
reviewed tag, replace the SHA, update the `# vX.Y.Z` comment, run `scripts/check-actions-pinned.sh`. Dependabot
(`.github/dependabot.yml`) proposes these weekly, grouped.

## 5. Open gaps (not faked)

- **Echidna, Mythril, mutation testing, mainnet-fork tests**: no harness or config exists (audit O-07, G-14). The
  nightly workflow does not contain placeholder steps for them.
- **Testnet deployment job and deployment-manifest signing** (O-08, O-13): not implemented.
- **IPFS / ENS / Tor / Pages publication** (O-11): intentionally disabled.
- **Signing-key fingerprint**: not recorded anywhere yet; the maintainers must publish it out of band.
- **Dependency review on PRs, CodeQL, CODEOWNERS**: not added (CODEOWNERS needs real owners).
- **Relayer Docker image** is not built, scanned, or attested by these workflows.
- Hash-pinning of router/fee-recipient into the bundle (S3-01) is an application fix outside this pipeline.

## 6. Unverified

The three workflows have never run on GitHub. Action SHAs were resolved from `git ls-remote` tag listings, not
independently re-checked on another path. `REQUIRE_ANVIL=1` takes effect only once the relayer test reads it. The
signed-tag presence check in `release.yml` (annotated-tag fetch with the workflow token) is untested on a real tag
push. Reproducibility was checked on one Linux host only.
