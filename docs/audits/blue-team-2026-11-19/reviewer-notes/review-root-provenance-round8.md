> Reviewer checkpoint. Earlier pending lists describe the time of that handoff. Final completion and finding dispositions are authoritative in [coverage.md](../coverage.md) and [findings.md](../findings.md). Earlier BROWSER-01 wording about absent Pay route coverage is superseded by the correction in the canonical register.

# Root source-provenance refresh — round 8

**Complete: 37 of 37 assigned path/blob versions, representing 5,605 source lines.** This refresh adds no confirmed production finding and does not change the seven-finding canonical register.

## Pinned scope and method

- Frozen main: `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
- Combined candidate: `e22c1748a3de6eb02f5be3abe27d634b238c67c6`.
- Exact assignment: the `residual` array in `audit-root-provenance-residual.json`.
- Fresh complete numbered reads: **27 versions / 3,662 lines**.
- Complete added/deleted diffs: **10 candidate versions / 1,943 logical lines**, each against a named fresh full read in this report.
- Every assigned SHA/path resolves to its stated blob; all line counts were checked. Assigned source output had no truncations.
- No target execution, tests, builds, installation, probes, transactions, network requests, Git mutations or source edits occurred. Only these two scratch review reports were written.

The JSON distinguishes directly displayed ranges from complete logical version coverage. Each diff row names the exact full baseline and records all hunks, added/deleted ranges and unchanged-line mappings. No search result or undocumented earlier baseline was used to claim coverage. A truncated supplemental audit-note read was repaired separately; it does not contribute source coverage.

## Review result

The canonical notes were read for context: BROWSER-01, PN-01, PN-02, PN-03, PN-04, PN-05 and SN-K01 remain the seven findings. All of their cited production sources were not reread in this bounded pass, so this report does not republish them as fresh evidence or change their branch dispositions.

Fresh review covered router/relayer authorization and accounting, Registry review/lookup lifecycle, encrypted tags, display/fragment/merchant/profile/jitter helpers, CSP/bundle qualification, and Pages build/artifact/workflow/smoke source. No additional confirmed production defect was established.

### Existing candidate changes kept separate

#### ROOT-R8-K01 — CSP origin validation and effective-policy qualification

Candidate rejects policy punctuation, wildcards and credentials in configured origins, checks effective enforcing meta/header policies and limits scanner exemptions to the configured connect-src range. Preserve the distinction between artifact policy and actual host enforcement.

Source: [apps/web/scripts/csp.mjs:8–52](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/scripts/csp.mjs#L8-L52); [apps/web/scripts/apply-csp.mjs:32–103](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/scripts/apply-csp.mjs#L32-L103); [apps/web/scripts/scan-bundle.mjs:94–141](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/scripts/scan-bundle.mjs#L94-L141).

#### ROOT-R8-K02 — Known public test release keys excluded from release verification

Candidate rejects the listed public test verification keys in identified release builds; the Pages builder explicitly requests production parsing before bundling manifests. This is a source guard; no production key inventory was inspected.

Source: [apps/web/scripts/validate-deployments.mjs:38–95](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/scripts/validate-deployments.mjs#L38-L95); [scripts/pages/build-pages.sh:95–112](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/scripts/pages/build-pages.sh#L95-L112).

#### ROOT-R8-K03 — Registry read lifecycle and network revision invalidation

Candidate aborts obsolete operations after lifecycle/context changes and includes network revision in review authority and lookup checks. This does not reclassify BROWSER-01 onto the assigned older snapshots.

Source: [apps/web/src/features/registry/RegistryView.tsx:72–133](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/features/registry/RegistryView.tsx#L72-L133); [apps/web/src/features/registry/RegistryView.tsx:238–247](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/features/registry/RegistryView.tsx#L238-L247).

#### ROOT-R8-K04 — Strict merchant-pin JSON and narrow profile composition

Candidate rejects ambiguous duplicate pin members through strict JSON parsing and allows the wider build profile only for known full/absent inputs. These are existing changes, not new confirmed production findings.

Source: [apps/web/src/lib/merchantIdentity.ts:28–41](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/merchantIdentity.ts#L28-L41); [apps/web/src/lib/buildProfile.ts:21–31](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/buildProfile.ts#L21-L31).

#### ROOT-R8-K05 — Monotonic expiry floor during local delay

Candidate combines finite-clock validation and monotonic elapsed time with the current wall clock for expiry while waiting or skipping the wait. This helper alone does not establish every submit-time expiry check.

Source: [apps/web/src/lib/jitter.ts:86–108](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/jitter.ts#L86-L108); [apps/web/src/lib/jitter.ts:116–122](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/jitter.ts#L116-L122).

#### ROOT-R8-K06 — Shared lean exclusions across artifact gates

Candidate shares module-exclusion logic between the bundle scanner and Pages verifier and restricts the allowed embedHost export. Reading a generated-report gate is not evidence that a build passed.

Source: [scripts/pages/lean-exclusions.mjs:7–45](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/scripts/pages/lean-exclusions.mjs#L7-L45); [scripts/pages/verify-pages-site.mjs:188–204](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/scripts/pages/verify-pages-site.mjs#L188-L204).

#### ROOT-R8-K07 — Artifact integrity before promotion and attestation before deployment

Candidate builder invokes independent exact-file/checksum/source-commit verification before promoting site/evidence. The workflow isolates attestation permissions and requires that job before deploy. Trusted checksum provenance and stable verification inputs remain explicit requirements.

Source: [scripts/pages/build-pages.sh:219–229](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/scripts/pages/build-pages.sh#L219-L229); [scripts/pages/verify-pages-artifact.mjs:1–6](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/scripts/pages/verify-pages-artifact.mjs#L1-L6); [scripts/pages/verify-pages-artifact.mjs:60–138](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/scripts/pages/verify-pages-artifact.mjs#L60-L138); [.github/workflows/pages.yml:213–267](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/.github/workflows/pages.yml#L213-L267).

#### ROOT-R8-K08 — Declared origin and expanded navigation smoke scope

Candidate compiles its declared origin and passes it to post-deployment smoke. The smoke source visits lean views and a synthetic invoice while recording off-project requests. These scripts were read only; no deployed state was established.

Source: [scripts/pages/build-pages.sh:115–131](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/scripts/pages/build-pages.sh#L115-L131); [.github/workflows/pages.yml:293–303](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/.github/workflows/pages.yml#L293-L303); [scripts/pages/smoke.mjs:46–51](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/scripts/pages/smoke.mjs#L46-L51); [scripts/pages/smoke.mjs:89–137](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/scripts/pages/smoke.mjs#L89-L137); [scripts/pages/smoke-walk.mjs:27–65](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/scripts/pages/smoke-walk.mjs#L27-L65); [scripts/pages/smoke-url.mjs:1–32](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/scripts/pages/smoke-url.mjs#L1-L32).

### Source boundaries retained

**ROOT-R8-B01.** Router fee-recipient availability is immutable: native rejection or token restrictions can stop fee-bearing transfers. Metadata/announcements alone do not establish invoice authenticity, a valid ephemeral curve point or arbitrary token trust. ROOT-A01/ROOT-A02 context remains; no new bypass is claimed.

Source: [packages/contracts/src/GhostPayRouter.sol:59–67](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/contracts/src/GhostPayRouter.sol#L59-L67); [packages/contracts/src/GhostPayRouter.sol:117–128](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/contracts/src/GhostPayRouter.sol#L117-L128); [packages/contracts/src/GhostPayRouter.sol:177–235](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/contracts/src/GhostPayRouter.sol#L177-L235).

**ROOT-R8-B02.** The relayer signature includes token, owner, destination, fee recipient, amount, fee, deadline and nonce. Authorization consumes the owner nonce before token calls, and execution checks exact deltas. Third-party cryptographic library internals and deployed bytecode were not re-audited.

Source: [packages/contracts/src/GhostPaySweepRelayer.sol:79–115](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/contracts/src/GhostPaySweepRelayer.sol#L79-L115); [packages/contracts/src/GhostPaySweepRelayer.sol:117–148](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/contracts/src/GhostPaySweepRelayer.sol#L117-L148).

**ROOT-R8-B03.** Tag code derives separate nonextractable AES/HMAC keys, binds version-2 ciphertext to chain/record/lookup coordinates, and stages imports/rotation for guarded snapshot-dependent batch writes. Runtime storage durability, all caller lifecycles and WebCrypto implementation behavior were not executed or requalified here.

Source: [apps/web/src/lib/tags.ts:81–113](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/tags.ts#L81-L113); [apps/web/src/lib/tags.ts:160–205](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/tags.ts#L160-L205); [apps/web/src/lib/tags.ts:407–451](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/tags.ts#L407-L451); [apps/web/src/lib/tags.ts:461–498](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/tags.ts#L461-L498).

**ROOT-R8-B04.** Both assigned RegistryView versions mount WalletAttempts without a wallet prop. That call shape alone is insufficient for BROWSER-01: the canonical register confines it to the separate #300 component contract. This pass did not reread that branch or expand the finding to main/candidate.

Source: [apps/web/src/features/registry/RegistryView.tsx:253–258](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/features/registry/RegistryView.tsx#L253-L258); [apps/web/src/features/registry/RegistryView.tsx:269–274](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/features/registry/RegistryView.tsx#L269-L274).

## Exact coverage ledger

Every row has status **reviewed**. `Full` is a fresh read of every line. `Diff` includes every changed/deleted hunk against the named fresh full baseline. Full object identities and detailed ranges are retained in JSON.

| ID | Pinned source | Blob | Lines | Method | Fresh full baseline |
|---|---|---|---:|---|---|
| ROOT-R8-001 | [c977b5d6723f: apps/web/scripts/csp.mjs](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/scripts/csp.mjs) | `6cae62f1117c8cd9b23ded19c8bd8f341456704d` | 30 | Full | — |
| ROOT-R8-002 | [c977b5d6723f: apps/web/scripts/scan-bundle.mjs](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/scripts/scan-bundle.mjs) | `2b1b579c18c66c552c407d20d96bda6e28bed1e4` | 238 | Full | — |
| ROOT-R8-003 | [c977b5d6723f: apps/web/scripts/validate-deployments.mjs](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/scripts/validate-deployments.mjs) | `d64a04674ef09a8adff4ee3469694c893edb3e48` | 53 | Full | — |
| ROOT-R8-004 | [c977b5d6723f: scripts/pages/build-pages.sh](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/scripts/pages/build-pages.sh) | `12f1c53b41c9e4a67fd365e911fa10ddce548ee3` | 208 | Full | — |
| ROOT-R8-005 | [c977b5d6723f: scripts/pages/verify-pages-site.mjs](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/scripts/pages/verify-pages-site.mjs) | `30fbe84911c51c484a966a604351ed4a395dd18e` | 291 | Full | — |
| ROOT-R8-006 | [c977b5d6723f: .github/workflows/pages.yml](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/.github/workflows/pages.yml) | `5ef7f8f55035f852da2e1398ae39fc6455a91ebb` | 261 | Full | — |
| ROOT-R8-007 | [c977b5d6723f: apps/web/src/features/registry/RegistryView.tsx](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/features/registry/RegistryView.tsx) | `68e1c58aa7dd21d9208c3d67fc752b576f7d780f` | 359 | Full | — |
| ROOT-R8-008 | [e22c1748a3de: apps/web/src/lib/registry.ts](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/registry.ts) | `6dcd24ced090ac1009b7949f4707a3d8e1a5f8ea` | 22 | Full | — |
| ROOT-R8-009 | [e22c1748a3de: apps/web/src/lib/tags.ts](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/tags.ts) | `6eb3bdbde7413f6b26a6df9219ab2184c259b080` | 565 | Full | — |
| ROOT-R8-010 | [c977b5d6723f: apps/web/src/lib/errors.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/errors.ts) | `c3be00ac752cebd8f0234dbfb6f275e9741bb527` | 94 | Full | — |
| ROOT-R8-011 | [e22c1748a3de: apps/web/src/lib/displayText.ts](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/displayText.ts) | `2202f8e612c74efa1cd4150f53f247fbc3e5c726` | 39 | Full | — |
| ROOT-R8-012 | [e22c1748a3de: apps/web/src/lib/sanitize.ts](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/sanitize.ts) | `e5c281aa7f8105b71ef93ea407e8dfa454892317` | 25 | Full | — |
| ROOT-R8-013 | [c977b5d6723f: apps/web/src/lib/merchantIdentity.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/merchantIdentity.ts) | `8859aeb207e4b839838bdc3a5c8d9433fd9ae308` | 91 | Full | — |
| ROOT-R8-014 | [e22c1748a3de: apps/web/src/lib/fragment.ts](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/fragment.ts) | `9f361be2be54403f1980999bb64937299760e719` | 35 | Full | — |
| ROOT-R8-015 | [c977b5d6723f: apps/web/src/lib/buildProfile.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/buildProfile.ts) | `388e0a0b02e35c47b8595a57239eeb7f69334c64` | 32 | Full | — |
| ROOT-R8-016 | [c977b5d6723f: apps/web/src/lib/jitter.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/jitter.ts) | `f4d6fefe892130d70bfa9cea5113f611ccea8b02` | 108 | Full | — |
| ROOT-R8-017 | [e22c1748a3de: packages/contracts/src/GhostPayRouter.sol](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/contracts/src/GhostPayRouter.sol) | `bc6369fffe44ebcad5548ae731860161444e7998` | 250 | Full | — |
| ROOT-R8-018 | [e22c1748a3de: packages/contracts/src/GhostPaySweepRelayer.sol](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/contracts/src/GhostPaySweepRelayer.sol) | `3095160e30f5bcc109e7786ec410ab81741dadd4` | 150 | Full | — |
| ROOT-R8-019 | [e22c1748a3de: packages/contracts/src/interfaces/IERC5564Announcer.sol](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/contracts/src/interfaces/IERC5564Announcer.sol) | `f7e6b9e8088215cbebf9c36a98b05e3493e1cc0e` | 45 | Full | — |
| ROOT-R8-020 | [e22c1748a3de: packages/contracts/src/interfaces/IGhostPayRouter.sol](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/contracts/src/interfaces/IGhostPayRouter.sol) | `1ecd181745e4feae9ec3cd4b7b7d59a7806ddaff` | 119 | Full | — |
| ROOT-R8-021 | [e22c1748a3de: packages/contracts/src/interfaces/IGhostPaySweepRelayer.sol](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/packages/contracts/src/interfaces/IGhostPaySweepRelayer.sol) | `09b5605c6dfea8cd63310f0366a7e800c54e99ea` | 94 | Full | — |
| ROOT-R8-022 | [e22c1748a3de: apps/web/scripts/csp.mjs](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/scripts/csp.mjs) | `6657fd5eb74278a37355c56847d47e6affb92c7e` | 52 | Diff | ROOT-R8-001 |
| ROOT-R8-023 | [e22c1748a3de: apps/web/scripts/scan-bundle.mjs](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/scripts/scan-bundle.mjs) | `6b610050fa547484afed987fc26ef1a5e1ed5d8d` | 336 | Diff | ROOT-R8-002 |
| ROOT-R8-024 | [e22c1748a3de: apps/web/scripts/validate-deployments.mjs](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/scripts/validate-deployments.mjs) | `76a6132fcc692a18e657c3880427c8f60739c6b8` | 101 | Diff | ROOT-R8-003 |
| ROOT-R8-025 | [e22c1748a3de: scripts/pages/build-pages.sh](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/scripts/pages/build-pages.sh) | `2022cf30a0f18535131c2f9651d292226550835b` | 229 | Diff | ROOT-R8-004 |
| ROOT-R8-026 | [e22c1748a3de: scripts/pages/verify-pages-site.mjs](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/scripts/pages/verify-pages-site.mjs) | `1354549a79a4c550ee55d21ebe6e77f22b2af4ce` | 290 | Diff | ROOT-R8-005 |
| ROOT-R8-027 | [e22c1748a3de: .github/workflows/pages.yml](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/.github/workflows/pages.yml) | `552e4221da41f57b47a2f1dd816f6f3aa45b52ee` | 303 | Diff | ROOT-R8-006 |
| ROOT-R8-028 | [e22c1748a3de: apps/web/src/features/registry/RegistryView.tsx](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/features/registry/RegistryView.tsx) | `5ca89f54457128b887eb9107fc4eac66ce8c0530` | 375 | Diff | ROOT-R8-007 |
| ROOT-R8-029 | [e22c1748a3de: apps/web/src/lib/merchantIdentity.ts](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/merchantIdentity.ts) | `183a8fbc588cb1c66e5ec480e572849b803761db` | 94 | Diff | ROOT-R8-013 |
| ROOT-R8-030 | [e22c1748a3de: apps/web/src/lib/buildProfile.ts](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/buildProfile.ts) | `001fbf1105e1d28768624df6c47ccfdb16957d1a` | 36 | Diff | ROOT-R8-015 |
| ROOT-R8-031 | [e22c1748a3de: apps/web/src/lib/jitter.ts](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/src/lib/jitter.ts) | `9845576adfb522c17db145b1772276f66523180c` | 127 | Diff | ROOT-R8-016 |
| ROOT-R8-032 | [e22c1748a3de: apps/web/scripts/apply-csp.mjs](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/apps/web/scripts/apply-csp.mjs) | `79016d47eec0e5a85da365c4d8220fe3fee05a63` | 121 | Full | — |
| ROOT-R8-033 | [e22c1748a3de: scripts/pages/verify-pages-artifact.mjs](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/scripts/pages/verify-pages-artifact.mjs) | `56a1753d5181a6c5f9738ab62fd5f32911b6b516` | 153 | Full | — |
| ROOT-R8-034 | [e22c1748a3de: scripts/pages/lean-exclusions.mjs](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/scripts/pages/lean-exclusions.mjs) | `3eb88a297c4aaf5bb620a60e4b5503862a1daef4` | 45 | Full | — |
| ROOT-R8-035 | [e22c1748a3de: scripts/pages/smoke.mjs](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/scripts/pages/smoke.mjs) | `68c722f8c8ec68f844dce85e366059f88550eef3` | 137 | Full | — |
| ROOT-R8-036 | [e22c1748a3de: scripts/pages/smoke-walk.mjs](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/scripts/pages/smoke-walk.mjs) | `c0f3ca90f5c76da840542904cdeeb870e08ac437` | 65 | Full | — |
| ROOT-R8-037 | [e22c1748a3de: scripts/pages/smoke-url.mjs](https://github.com/djshellshoxxx/GhostPay/blob/e22c1748a3de6eb02f5be3abe27d634b238c67c6/scripts/pages/smoke-url.mjs) | `ddb9f17a688368c2f0f45197d7af6638f80ec0a8` | 32 | Full | — |

## Limits and pending work

- Only the exact 37 assigned old-main/candidate versions are covered by this pass; newer-main/release-hosting review belongs to the root lane.
- No independently full-read evidence from separate reports was needed or imported for these residual rows.
- Test/support sources outside the residual assignment were not reread and no passing result is claimed.
- Third-party implementations, live chain state, generated artifacts, runtime behavior and published hosting configuration were not verified.
- No additional confirmed production issue emerged; this is not a claim that the repository is defect-free.

**Pending in this assignment: none.** The root lane separately owns newer-main changes and hosting conclusions.
