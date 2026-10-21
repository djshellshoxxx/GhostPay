# Supply-chain security spec

Status: draft. Research date 2026-10-21. Branch claude/remote-extensions-1.
Scope: dependency pinning, SBOM, reproducible builds, release signing, CI hardening, third-party review.
Sources checked: `docs/` grep, `packages/*/DEVIATIONS.md`, `docs/threat-model/THREAT_MODEL.md`, `docs/remote/audits/` (haiku reports, unverified).

## 0. Existing coverage (why this spec is needed)

Coverage exists but is scattered, partly aspirational, and has no numbered, testable requirements in `docs/remote/security-specs/`.

- `docs/DEVELOPER_SPECIFICATION.md` L65-66, L378, L417-423, L444: lockfile, exact pins, SBOM, signed release, SHA-256 match across mirrors, CI gate list. Prose only.
- `docs/APP_AND_RELAYER_SPEC.md` L42, L50, L67: S4 release engineering "drafted (in progress), never run on GitHub; no signed release, no key fingerprint, no manifest signing procedure."
- `docs/adr/ADR-LOG.md` L14-15 (ADR-0004 exact pins, lockfile, `THIRD_PARTY.md`), L82-85 (ADR-0015: signing decision; signed tag, SHA256SUMS, SBOM, manifest, reproducible build on second machine, out-of-band key fingerprint). Signing scheme and key custody are an owner decision (`docs/DEPLOYMENT_MANIFEST.md` L68, L97).
- `docs/audits/03-security-review-client-relayer.md` L35, L51, L113, L201-204, L227: S3-04 (release hash self-attested), S3-17 (CI/build/supply-chain gaps; digest-pinned image, release workflow with environment approval, `actions/attest-build-provenance`), S3-24 (`viem` pulls `@noble/curves` 1.9.x and `@noble/hashes` 1.8.0 beside pinned 2.4.0; ADR-0004 says "no other crypto library"). S3-01 pinning is referenced but not in this spec.
- `docs/tools/third-party-table.mjs`: generates a third-party table from `package-lock.json`; `--verify` checks installed licences and versions against the lockfile. Only partial supply-chain control (licence/version drift, no integrity or provenance check).
- `docs/operators/release-and-verify.md` (135 lines): operator-side verification procedure. Not read in full for this spec; treat as dependent on ADR-0015 outcome.
- `docs/MASTER_BLUEPRINT.md` L128, L149, L168, L213-216: reproducible builds, locked deps, dependency review, exit gate for release signing. Prose only.
- `docs/POST_LAUNCH_FEATURES_SECURITY_ROADMAP.md` L161, L187: embed SDK pinned versioned URL, hash/signature, SRI caveat.
- `docs/threat-model/THREAT_MODEL.md`: lists supply chain as a threat; per S3-04 some mitigation cells claim release-hash verification that is not yet true.
- `packages/*/DEVIATIONS.md` (6 files): no supply-chain requirements found. `core-crypto` pins TypeScript 5.9.3 for a peer-range reason (`typescript-eslint@8.72.0`). `btc-silent-payments` pins `@scure/*` and `@noble/*` 2.4.0 exactly.
- `docs/SECURITY_QA_DEVOPS_PLAYBOOK.md` (677 lines): not reviewed for this spec; likely overlaps CI section.
- `docs/remote/audits/*.md`: haiku audit reports. Unverified claims. Not relied on here.

Gaps: no third-party review process spec; no SBOM format or update rule; no CI permission/secret rules in one place; no reproducibility test; no key custody for release signing; no acceptance tests.

## 1. Purpose

Ensure that the bytes a user runs (web bundle, embed SDK, relayer image, contracts build artifacts, deployment manifest) come from reviewed source, through a pinned, reproducible, signed, and attested pipeline, and that any third-party code entering the build is reviewed and recorded.

## 2. Assets

- A1 Release artifacts: web bundle, `SHA256SUMS`, embed script, relayer container image.
- A2 Release signing key and any CI signing credentials.
- A3 Deployment manifest (router/contract addresses, signer keys), signed by the release key.
- A4 Lockfile (`package-lock.json`), Foundry/`lib/` contract dependencies, `solc` version, `foundry.lock` or equivalent.
- A5 CI runner, workflow files, GitHub secrets, environment approvals.
- A6 Source provenance: tags, commits, branch protection.
- A7 SBOM documents per release.
- A8 Reviewer records (third-party review sign-off, risk acceptance).

## 3. Adversaries

- ADV1 Malicious or compromised upstream package (npm typosquat, maintainer takeover, malicious version of a pinned or transitive dep).
- ADV2 Compromised GitHub Action or unpinned action tag; poisoned workflow from a PR (`pull_request_target`, untrusted input in `run:`).
- ADV3 Compromised hosting (GitHub Pages, IPFS gateway, ENS resolver, mirror, onion mirror) serving a modified bundle. Covered by S3-04.
- ADV4 Insider or stolen maintainer credentials pushing an unreviewed tag or release.
- ADV5 Build-environment tampering (non-deterministic or host-dependent build output that hides a modification).
- ADV6 Leaked signing key or CI secret in logs or artifacts.
- ADV7 Downgrade or rollback: users pointed at an older, vulnerable signed release.

Out of scope: a compromised, fully trusted release signer (see Open questions); hardware-wallet firmware; upstream chain consensus.

## 4. Requirements

Testable. MUST = blocking for release. SHOULD = required unless a recorded exception exists.

### 4.1 Dependency pinning

- SC-PIN-1 MUST: every direct dependency in every workspace `package.json` is an exact version (no `^`, `~`, `*`, `latest`, or git/URL specs). Test: CI script fails on any non-exact range; baseline 0 violations (S3-03 lockfile note says all exact today).
- SC-PIN-2 MUST: a lockfile is committed and CI installs with `npm ci` (or equivalent frozen install). Test: CI fails if lockfile is out of sync with manifests.
- SC-PIN-3 MUST: every lockfile entry resolves to the public registry with `integrity` (SRI); no git, tarball or file deps in release builds. Test: lockfile scan. Current: 5 workspace links without integrity (expected); 0 git/tarball.
- SC-PIN-4 MUST: contract dependencies (`lib/`) are pinned by commit hash or exact version and recorded; `solc` and Foundry versions are pinned (ADR-0004: Foundry 1.8.5, solc 0.8.28). Test: CI reads pinned values from a single file and fails on drift.
- SC-PIN-5 MUST: duplicate crypto copies are either eliminated or recorded as an accepted deviation with the exact resolved versions in the release SBOM. Test: `npm ls @noble/curves @noble/hashes` output is archived per release; a new duplicate fails CI unless listed in an exception file. Addresses S3-24.
- SC-PIN-6 SHOULD: dependency updates go through a PR that includes the lockfile diff, the upstream changelog link, and a recorded review (see 4.5).
- SC-PIN-7 MUST: install lifecycle scripts are disabled in CI and release jobs (`npm ci --ignore-scripts`), with an allowlist for any script that is required (currently only `fsevents`, optional on macOS). Test: CI config grep and build log check.

### 4.2 SBOM

- SC-SBOM-1 MUST: each tagged release produces a CycloneDX SBOM covering the shipped web bundle and relayer image (dev-only dependencies listed separately). Test: release job artifact exists and validates against the CycloneDX schema in CI.
- SC-SBOM-2 MUST: SBOM lists name, exact version, licence, and package URL (purl) for each component, and the lockfile hash it was generated from.
- SC-SBOM-3 MUST: SBOM is generated from the lockfile, not from the installed tree alone; the release job fails if they disagree (reuse `docs/tools/third-party-table.mjs --verify` logic or equivalent).
- SC-SBOM-4 SHOULD: SBOM is attested (signed) with the same mechanism as artifacts (4.4).
- SC-SBOM-5 MUST: SBOM is regenerated and diffed against the previous release; any added or changed runtime component is listed in the release notes.

### 4.3 Reproducible builds

- SC-REP-1 MUST: the web bundle and relayer build are deterministic: same tagged commit, same lockfile, same toolchain image produce byte-identical `SHA256SUMS`. Test: two independent CI runs (different runner, clean cache) produce identical hashes.
- SC-REP-2 MUST: build environment is pinned by digest (container image digest, Node version exact). Test: Dockerfile has `FROM ...@sha256:`; CI grep.
- SC-REP-3 MUST: no timestamps, absolute paths, hostnames, or random IDs enter the artifact (fixed `SOURCE_DATE_EPOCH`, sorted file order, normalized mtimes). Test: reproducibility job compares hashes after build in a different directory path.
- SC-REP-4 MUST: a documented procedure lets a third party rebuild from the tag on a clean machine and compare `SHA256SUMS` (required by ADR-0015; the gate in `docs/DEVELOPER_SPECIFICATION.md` L423).
- SC-REP-5 SHOULD: contract bytecode reproduction is checked against the deployed bytecode with pinned `solc` settings (optimizer, EVM version, metadata hash policy recorded).
- SC-REP-6 MUST: all mirrors serve the same bytes; cross-mirror hash comparison is part of release verification (DEVELOPER_SPECIFICATION gate).

### 4.4 Release signing and provenance

- SC-SIG-1 MUST: releases are made from signed tags on protected branches; unsigned or unprotected tags do not trigger release jobs. Test: workflow trigger review; branch protection settings checked in a settings-audit step (manual evidence recorded).
- SC-SIG-2 MUST: release artifacts (`SHA256SUMS`, SBOM, release manifest) carry a detached signature or build-provenance attestation. Scheme is fixed by ADR-0015 (owner decision; see Open questions). Test: verification command in `docs/operators/release-and-verify.md` succeeds on a clean machine.
- SC-SIG-3 MUST: the signing key fingerprint is published out of band (not only from the origin being verified) and recorded in the repo. Test: fingerprint in docs matches key used in the release job.
- SC-SIG-4 MUST: signing keys are not present in the repo, in browser bundles, in logs, or in any artifact. Test: secret scanning (`mcp__github__run_secret_scanning` or equivalent) and an artifact scan for key material on each release.
- SC-SIG-5 MUST: signing happens in a protected environment with required reviewer approval, and no PR-triggered job can access the signing secret. Test: workflow review; environment settings evidence.
- SC-SIG-6 MUST: the user-facing `release hash` display is not presented as verification; its wording states that it is self-attested (S3-04). Test: UI string check.
- SC-SIG-7 MUST: the deployment manifest (A3) is signed by the release key and the signature is checked by the client before use (S3-01). Test: unit test with an altered manifest must be rejected.
- SC-SIG-8 SHOULD: key rotation and revocation procedure is documented, including what happens to old signed releases.
- SC-SIG-9 MUST: provenance attestation (SLSA-style build provenance) is generated for the release artifacts, and records source commit, workflow path, and builder identity. Test: attestation verifies with the published verifier.

### 4.5 CI hardening

- SC-CI-1 MUST: every third-party action is pinned to a full commit SHA with a comment giving the release tag. Test: grep of `.github/workflows/*.yml` for `uses:` lines without a 40-hex SHA fails CI. Note: SHAs must be verified with `gh api` in a tool-enabled session (S3-17), not from memory.
- SC-CI-2 MUST: every workflow sets `permissions:` explicitly, default `contents: read`, with write scopes granted per job only. Test: workflow lint (e.g. zizmor or actionlint-equivalent; tool choice open).
- SC-CI-3 MUST: workflows triggered by `pull_request` from forks get no secrets and no write token. `pull_request_target` MUST NOT check out or execute PR head code. Test: workflow lint rule for `pull_request_target` plus checkout ref check.
- SC-CI-4 MUST: untrusted values (PR titles, branch names, issue bodies) are not interpolated into `run:` blocks; they go through `env:`. Test: lint rule.
- SC-CI-5 MUST: release job uses an environment with required approval (S3-17); no long-lived publish tokens where OIDC is supported.
- SC-CI-6 MUST: CI runs lint, typecheck, unit and property tests, contract tests and fuzzing, static analysis, dependency audit, build, artifact endpoint scan, and reproducibility comparison (DEVELOPER_SPECIFICATION L444). Test: CI config contains each job; a missing job fails the release gate.
- SC-CI-7 MUST: the Playwright job exists and runs in CI (S3-17). Test: job present and green on main.
- SC-CI-8 MUST: the base image used for build and relayer is digest-pinned and `Dockerfile.dockerignore` excludes `.env`, keys, `node_modules`, and `.git`. Test: Dockerfile lint and an image file listing scan.
- SC-CI-9 SHOULD: CI cache is not shared between release and PR jobs. Test: workflow review.
- SC-CI-10 MUST: secrets are masked and never echoed; job logs are checked for key-like patterns on release runs.
- SC-CI-11 SHOULD: Dependabot or equivalent opens update PRs for pinned deps and actions; each PR carries the review in 4.6.

### 4.6 Third-party review process

- SC-REV-1 MUST: any new runtime dependency, new transitive crypto library, new action, or new base image is added through a PR that records: purpose, licence, maintainer count and activity, advisories checked (date and source), and the reviewer. Record location: a `THIRD_PARTY.md` entry (ADR-0004 reference) or equivalent.
- SC-REV-2 MUST: the crypto libraries used (`@noble/*`, `viem`) are reviewed on each version bump: release notes, advisories, and lockfile diff. Test: PR template checkbox; spot check each quarter.
- SC-REV-3 MUST: advisories are checked on each release (`npm audit` or equivalent, plus GitHub advisory DB) and any unresolved high or critical item is recorded as a release exception with an owner and expiry date.
- SC-REV-4 SHOULD: an external independent review of the supply-chain pipeline (this spec's 4.1-4.5) happens before first signed release (ADR-0015 / exit gate in MASTER_BLUEPRINT L216). Output is stored under `docs/reviews/` or `docs/audits/`.
- SC-REV-5 MUST: reviewer records and exceptions are stored in the repo, not only in chat or in unverified audit outputs. `docs/remote/audits/*` reports are inputs, not evidence, until verified against source.
- SC-REV-6 SHOULD: packages with install scripts, native code, or a single maintainer are flagged for extra review.

### 4.7 Downgrade and rollback

- SC-DG-1 MUST: the client refuses a manifest or release whose version is lower than the last accepted one, unless an explicit operator override is recorded. Test: unit test with older signed manifest rejected.
- SC-DG-2 SHOULD: release notes list the minimum safe version for each advisory.

## 5. Design notes

- Pinning is cheap and enforceable; start with a CI script that fails on any non-exact range and any missing SRI. This covers SC-PIN-1, 2, 3 with no new tooling.
- Reproducibility: fix Node and image digest first; then compare hashes from two runners. Expect bugs in bundler timestamps and source maps; pin `SOURCE_DATE_EPOCH` and normalize paths.
- SBOM: generate from lockfile and from installed tree and diff. Use CycloneDX JSON as the format (open choice; see Open questions).
- Signing: ADR-0015 leaves the scheme open. Two candidates: (a) detached signature over `SHA256SUMS` with a key whose fingerprint is published out of band, or (b) keyless build attestation (Sigstore-style) plus a published identity. Both need a verifier in `docs/operators/release-and-verify.md`. Client-side verification of the manifest signature (SC-SIG-7) is needed in either case; in-app hash display does not verify anything (S3-04).
- Attestation does not stop a compromised source commit. Protected branches, reviewed tags, and two-person release approval are the controls for ADV4.
- CI: GitHub Actions workflows are the assumed CI. Pin actions by SHA; verify each SHA via `gh api` before writing it.
- Hosting: IPFS CID or SRI protects content only if the expected hash came from a trusted signed release (DEVELOPER_SPECIFICATION L352; POST_LAUNCH roadmap L187).

## 6. Acceptance tests

1. Pin check: CI job fails on a seeded `^` range in a branch; passes on main.
2. SRI check: CI job fails on a lockfile entry without `integrity` (non-workspace).
3. Lifecycle: `npm ci --ignore-scripts` build succeeds; only `fsevents` appears as skipped.
4. Duplicate crypto: `npm ls @noble/curves @noble/hashes` diff vs exception file; seeded duplicate fails CI.
5. SBOM: release job emits CycloneDX JSON; schema validation passes; component count equals lockfile count minus dev-only, with dev-only listed.
6. Reproducibility: two runners, clean caches, different checkout paths produce identical `SHA256SUMS`.
7. Mirror parity: GitHub Pages, IPFS, and one onion/mirror serve identical bytes; hash comparison passes.
8. Signature: `release-and-verify.md` verification succeeds on a clean VM using only the published fingerprint and no network access to the origin host for the key.
9. Tampered artifact: one byte changed in the bundle is rejected by the verification command.
10. Manifest: altered `signature` or altered field in the deployment manifest is rejected by the client (unit test).
11. Rollback: older signed manifest is rejected by the client.
12. CI lint: a `uses:` line without SHA fails; a `pull_request_target` checkout of PR head fails; a `run:` interpolation of `github.event.pull_request.title` fails.
13. Fork PR: a fork PR job sees no secrets and cannot write.
14. Secret leak: a seeded fake key in a branch is caught by secret scanning and by the artifact scan.
15. Review record: a new dependency PR without a `THIRD_PARTY.md` entry fails the review check.
16. Attestation: provenance verifier returns source commit and workflow path matching the tag.

## 7. Open questions

1. ADR-0015 signing scheme (detached key vs keyless attestation) and key custody: owner decision. Blocks SC-SIG-2 through SC-SIG-5.
2. Who holds the release key; quorum for release approval (single maintainer vs two-person).
3. SBOM format: CycloneDX JSON (assumed in S4) vs SPDX. Confirm with tooling.
4. Is the `pull_request_target` lint rule needed if no such workflow exists? Confirm current workflow files; none were read for this spec.
5. Relayer image: base image choice and digest source.
6. Whether `docs/remote/audits/*` haiku reports (including security-contracts.md, security-btcapps.md, security-tslibs.md) need verification before any of their supply-chain claims are cited. Treated as unverified here.
7. S3-01 (manifest authentication) is referenced but not specified in this file; decide whether it moves here or stays in the relayer/app spec.
8. Current `THREAT_MODEL.md` mitigation cells claiming release-hash verification need correction (S3-04); owner of that edit.
9. Third-party reviewer identity and scope for SC-REV-4.
10. Whether `docs/operators/release-and-verify.md` and `docs/SECURITY_QA_DEVOPS_PLAYBOOK.md` were fully checked against these requirements (only partially reviewed here).

## 8. References

Web sources were not retrieved in this run. The entries below are candidate primary sources for the implementer to fetch and verify. Mark each as verified only after retrieval.

- SLSA framework, build provenance: https://slsa.dev/ (not retrieved 2026-10-21; unverified)
- Reproducible Builds project: https://reproducible-builds.org/docs/ (not retrieved 2026-10-21; unverified)
- CycloneDX specification: https://cyclonedx.org/specification/overview/ (not retrieved 2026-10-21; unverified)
- SPDX specification: https://spdx.dev/specifications/ (not retrieved 2026-10-21; unverified)
- GitHub Actions security hardening guide: https://docs.github.com/en/actions/security-for-github-actions (not retrieved 2026-10-21; unverified)
- GitHub artifact attestations: https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations (not retrieved 2026-10-21; unverified)
- npm `ci` and `--ignore-scripts`: https://docs.npmjs.com/cli/v10/commands/npm-ci (not retrieved 2026-10-21; unverified)
- Sigstore documentation: https://docs.sigstore.dev/ (not retrieved 2026-10-21; unverified)
- Internal: `docs/adr/ADR-LOG.md` (ADR-0004, ADR-0015); `docs/audits/03-security-review-client-relayer.md` (S3-01, S3-03, S3-04, S3-17, S3-24); `docs/DEVELOPER_SPECIFICATION.md`; `docs/MASTER_BLUEPRINT.md`; `docs/DEPLOYMENT_MANIFEST.md`; `docs/operators/release-and-verify.md`; `docs/tools/third-party-table.mjs`.
