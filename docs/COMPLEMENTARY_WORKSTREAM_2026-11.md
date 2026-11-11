# Complementary workstream report (2026-11)

This workstream covers cross-cutting beta work that is **not** owned by the relayer, QR/device-exchange or core-product
streams: release integrity, build and dependency health, hosting, contract and crypto review, privacy analysis, CI,
multi-chain qualification and operator documentation.

- **Branch:** `claude/gracious-heisenberg-97ji6q`. **PR:** [djshellshoxxx/GhostPay#115](https://github.com/djshellshoxxx/GhostPay/pull/115) (draft).
- **Base:** `main` at `bd2652b`.
- **Status key:** *implemented* = code or config on the branch; *locally verified* = the command below was run in the
  authoring session; *CI* = needs or has hosted evidence; *human gate* = only the owner can close it.

**Hosted CI status at writing:** GitHub Actions held every run in the repository as queued (31 queued, 0 in progress at 2026-11-11T02:35Z, across all open PRs). No hosted CI result exists yet for this branch. Every "locally verified" claim below comes from the authoring session only. Contract tests (`forge test`, `forge fmt --check`, `forge snapshot --check`) and the SSH tag-signature cases still need a hosted run.

All reviews here are automated and AI-assisted. They are **not** an independent professional audit and are no security
guarantee. Nothing was published, tagged on the remote, or deployed.

## 1. Inventory and status

| # | Requirement | Pri | Result | Evidence | Remaining |
|---|---|---|---|---|---|
| 1 | Clean dependency tree; release `npm sbom` works | P0 | **Fixed.** `npm sbom` failed on `main` (`ESBOMPROBLEMS invalid zod@4.6.7 … abitype@1.0.8`), which broke the nightly reproducibility job (run 42806095211) and every tagged release build. A scoped override dedupes abitype. | `npm ls --all` and `npm sbom --omit dev` exit 0. The new CI gate fails on the pre-fix tree. | 0% |
| 2 | Per-push dependency-integrity gate | P0 | `npm ls --all --omit=dev` added to `ts-check`. | Locally shown to fail on `fc57154^` and pass after. | CI run |
| 3 | Reproducible release artifacts | P0 | SBOM no longer embeds the checkout directory name. `repro-check.sh` now builds in two differently named directories. | `repro-check.sh --head`: **REPRODUCIBLE** on the combined tree, 2m07s. | 0% |
| 4 | Cryptographic tag-signature verification | P0 | `scripts/verify-tag.sh` checks the tag against a pinned trust root. The trust root (`.github/release-signers/allowed_signers`) and the verifier are read from the default branch. The tag is re-verified after approval and must not move before the draft. PGP fallback uses an isolated keyring. | 26 node tests (25 pass, 1 SSH case skipped locally without `ssh-keygen`). They now also run in CI shard 0. | **Human gate:** add the release key |
| 5 | `verify-release.sh` rejects tampered, incomplete or development artifacts | P0 | Manifest `channel` (`release`/`development`). Strict checks on hashes, SHA256SUMS completeness, commit, version and tarball paths and links. | Same tests; end-to-end temp-clone run. | 0% |
| 6 | Release-candidate procedure | P0 | `docs/operators/release-candidate-qualification.md`. | Documentation. | Rehearsal on a real tag |
| 7 | Hosting headers and cache safety | P0 | camera allowed for self in all four header configs (QR was blocked). SPA fallback, `index.html` and `build-info.json` are `no-cache`. COEP added to the deploy nginx. `/assets` immutable caching applies to success responses only. | Native `nginx -t`, `curl -I` header checks, `check-headers.sh`. | Caddy and the container are untested |
| 8 | Build-version identification | P0 | `build-info.json` and `<meta name="ghostpay-build">` (deterministic). Pages and Docker builds pass `GP_COMMIT`. | Web build plus bundle scan pass; repro check passes. | 0% |
| 9 | Rollback, monitoring, incident runbooks | P1 | `docs/operators/{rollback,monitoring}.md` added; `incident-response.md` extended. `selfhost.sh` rotates a verified backup atomically. | `selftest.sh`, `bash -n`. | Rollback end to end untested |
| 10 | CI reliability | P0 | Aggregate gates accept only success or skipped. Python 3.12 for Slither/Mythril/Echidna, plus `setuptools<81` for Mythril. CI doc `docs/developer/ci.md`. | YAML parses; `check-actions-pinned.sh` OK. | Green nightly run |
| 11 | Contract security review | P0 | Audit 26: no Critical or High. **AUD24-01 Medium open** (policy-router `policyHash` in calldata links a seller's scheme-2 payments; a regression of round-3 N-01). New audit tests. | solcjs 0.8.28 compile, Slither (informational only), Hardhat Solidity runner (new tests pass). | `forge test`, `forge snapshot` in CI; **owner decision on AUD24-01** |
| 12 | Crypto implementation review | P0 | Audit 27. EXTRA05-F1 (Low) fixed: registry lookup now enforces the EIP-55 checksum on mixed-case input. Cross-checks against a separate plain-bigint secp256k1 reference, an OpenSSL scrypt/AES-GCM check and EIP-712 "Ether Mail" vectors. | core-crypto 71, invoice-schema 635, chain-adapters 341 (+18 skipped). | Re-check against live EIP pages (not reachable from this session) |
| 13 | Privacy threat model and exposure matrix | P1 | `docs/threat-model/{PRIVACY_THREAT_MODEL,metadata-exposure-matrix}.md`, `docs/user/privacy-limits.md`. `privacyInvariants.test.ts` (TypeScript-AST based) pins no telemetry, no third-party origins and three global-`fetch` sites. | 14 tests; injected probes fail them. | 15 mitigations handed to owner teams (threat model section 9) |
| 14 | Multi-chain qualification | P1 | `docs/chains/QUALIFICATION-2026-11.md`. Fixed SOL-1 (non-adjacent duplicate signatures produced duplicate records), TRON-1 (non-canonical protobuf accepted) and TRON-3 (unhashed node JSON trusted). | solana-stealth 108, tron-adapter 73, BTC packages 369/158/161. | See section 3 |
| 15 | Independent adversarial review | P0 | 5 reviewers plus 2 refuting skeptics per finding over the whole diff: 20 findings, 12 upheld, 7 split, 1 refuted. All 12 upheld findings and 6 split ones fixed in `e387a52`. A re-review of that commit found 7 more (incomplete or inconsistent fixes); all fixed in `959b257`. | Section 2. | 0% |

## 2. Adversarial review outcomes

Upheld and fixed:

1. `privacyInvariants.test.ts` comment stripper deleted real code, so its checks were blind to most of
   `i18n/message.ts`. It now uses the TypeScript printer plus an AST global-`fetch` check, with a shrink guard.
2. The release tag test asserted that the committed trust root is empty. The owner's documented key-adding PR would
   then have failed CI and blocked every release. The test is now state-aware.
3. Nightly Mythril still failed on Python 3.12 (`pkg_resources` missing). Fixed with `setuptools<81` plus a `myth
   version` smoke check.
4. Pages and Docker builds did not embed `GP_COMMIT`. Fixed.
5. Operator docs told operators to compare served files against `SHA256SUMS`, which covers only the tarball, SBOM and
   manifest, and against a `manifestsSha256` that the release does not record. The docs now compare against the files
   of the verified tarball.
6. Smaller fixes: the `web-dist.prev` backup is now gitignored; a nginx comment overclaimed validation; three file:line
   citations were stale.

From split votes, fixed: atomic backup rotation; 404s under `/assets` no longer cached as immutable; IPFS CID wording;
Echidna/Mythril "no harness" wording; Tron test-count wording. Not changed: a release-build "ignored files" check.
Release builds run on a fresh CI checkout, so that case is not reachable there.

Second round (re-review of `e387a52`, all fixed in `959b257`):

- The AST `fetch` check missed `(globalThis as T).fetch`, the cast idiom the codebase already uses. Detection now
  unwraps casts, parentheses and `!`, and the detector has unit cases (15 flagged, 5 not flagged).
- The trust-root test rejected valid OpenSSH key types (ecdsa-sk, nistp384/521).
- The Caddy configs still marked `/assets` 404s immutable.
- The backup swap could lose the old backup if `mv` failed.
- `hosting.md` and `mirror-hosting.md` still said to write the CID into the attested manifest and to compare served
  files with `SHA256SUMS`.
- `testing.md` and the developer README still said Echidna is not in CI.

## 3. Multi-chain readiness (separate from the EVM beta)

| Chain | Status | Remaining (estimate) | Must stay disabled |
|---|---|---|---|
| Bitcoin silent payments | Tested locally plus regtest CI. Header chain (#74) and spend tracking (#113) unmerged. | ~35% | Mainnet |
| Bitcoin PayJoin | Tested locally; not wired to web; no CI job. | ~60% | All production use |
| Solana | Tested locally plus local-validator CI. | ~40% | Mainnet |
| Tron | Mock RPC only; no CI job. Open: TRON-2 (no confirmation depth) and TRON-7 (only GhostPay-built transfers are detected). | ~55% | Mainnet |
| ERC-4337 (v0.7) | Library tested; not used by web or relayer. Open: AA-1 (no callGas cap). | ~70% library; integration not started | Production paths |

The web navigation shows the BTC, Solana, Tron and Registry views with no build flag (`apps/web/src/App.tsx:22`). They
are testnet-only. Hiding them for an EVM-only beta is a core-product decision.

## 4. Remaining human-only gates

1. Add the release-signing public key to `.github/release-signers/allowed_signers`, and publish its fingerprint out of
   band. Until then every release fails closed at the tag check.
2. Create a `v*` tag ruleset, required reviewers on the `release` environment, and owner review on
   `.github/release-signers/**` and `scripts/verify-tag.sh`.
3. Decide on AUD24-01: restore the salt-only policy-router ABI across contracts, `policy-scheme` and `RouterCall.sol`.
4. Pin container images by digest (`docs/operators/hosting.md`).
5. Publish draft releases by hand. Hosting and publication stay disabled until a recorded owner decision.
6. Still open from audit 08: an independent professional audit, the trusted-setup ceremony, deployments, custody,
   funded-device testing, and legal and launch scope.

## 5. Ownership boundaries respected

No edits were made to the relayer (`apps/relayer`), the QR/device-exchange code (`packages/qr-exchange`), the core
product's views and flows, the Bitcoin packages (open PRs #74 and #113), the owner's `openai-agents.yml`, or the codex
and parallel-review workflows. `openai-agents.yml` is not a valid workflow (a bare step list). It fails on every push;
PR #82 covers it.
