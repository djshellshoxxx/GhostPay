# GhostPay continuation — seller-bound policy records and 425-branch checkpoint

Date: 2026-11-21 UTC. Repository: `djshellshoxxx/GhostPay`. **Draft only.** No deployment, release, contract, remote custody, mainnet access, or mainline merge.

## Exact source / ownership

- Frozen `main`: `aec179910c39081d820396409ff3139ff2264132` (verified identical to the previous cycle's main).
- Working branch: `fix/ghostpay-policy-record-seller-identity-20261121`, created directly from frozen main, ahead only, no parent stack.
- Confirmed defect: `GP-BUG-08` in [audit #312](https://github.com/djshellshoxxx/GhostPay/pull/312), `docs/notes/bugcheck-2026-11-19/FINDINGS.md`, section MV-01 in `details/multichain-views.md`.
- Prior implementation de-duplicated records by `policyHash` alone. Different sellers can use equal policy terms and therefore have the same policy hash. Importing the second silently discarded it; `PolicyCreate` nonetheless displayed an accepted/warn result. The record list also used the nonunique hash as its React key.
- Additional custody-sensitive path found during repair: `PolicyReceive` previously selected the first saved record by policy hash even when the currently loaded seller keys belonged to a different equal-hash record. The selected record feeds account deployment and withdrawal checks. The code must never choose a foreign seller's recovery record by ordering.

## Test-first correction

1. `a4aebd786a0d9c177e5129cfed86834ac5bf1a02`: browser-context regression for importing two validated records with identical terms but distinct public seller keys; duplicate import feedback; helper contract that chooses only a seller-matching record.
2. `d01250f75d69a98da789ef89d6e40745ce79ee92`: shared `recordIdentity.ts` matching the canonical meta-address seller keys and policy hash.
3. `a0c4e685b5d819510e84bc0331a6b8cf51bb209f`: `PolicyView` now de-duplicates the **full canonical meta-address**, with synchronous ref ownership and an `added` boolean result, avoiding rapid-import React updater races.
4. `e561b623957fba2d0fcdddda43ae996dd4ba60ce`: `PolicyCreate` distinguishes true duplicates, keys rendered record rows by full meta-address, and adds seller-specific suffixes to policy-record download names to avoid equal-hash filename collisions. A recovered already-loaded record is not falsely reported as newly restored.
5. `66104bc56695e88a5355d06f4fc1ad699a18210f`: `PolicyReceive` chooses a record only if its policy hash **and the currently loaded spending/view public keys** match.
6. `05ac042d4ca498edd1a2471a3a8248cbe4a549cb`: new English catalog message for already-loaded records. Other locales fall back to English where untranslated.
7. `c3b899c16cc1e927aeda5e40b6cb236d4b9ff74b`: clean up unused TypeScript type import.

The test uses only public test vectors, an in-memory mocked browser and no RPC, transactions, private-key exports, network access or production policy deployments. Existing policy accounts remain experimental and feature-flagged; production deployment pins stay unchanged.

**Qualification is not yet established.** This environment cannot clone `github.com` (DNS unavailable), so the regression has been committed but not executed locally. Obtain hosted exact-head Vitest/typecheck/lint/Pages/beta acceptance and independent review before any integration. A test source commit is not evidence of a passing test run.

## Incremental live branch census and review ownership

- Previously source-pinned inventory: [main census](../consolidation/current-census-20261120/CENSUS.json) at 392 names (reference main `aa3df1cb37274fae73af0ca957183c15c51b62d3`); additional 26 names in PR #351's `BRANCH_DELTA_418_EMBED_CI_20261121.json`; additional 2 in PR #352's `BRANCH_DELTA_420_WALLET_JOURNAL_20261121.json`.
- Current GitHub REST branch inventory was **fully paginated** on 2026-11-21: pages `100,100,100,100,25,0` (terminal empty page), 425 names. Relative to the combined 420-name checkpoint: **5 new names, 6 changed heads, 0 removed**.
- All eleven changed/new heads below were compared with exact pinned SHA to current main `aec179910c39081d820396409ff3139ff2264132`; no classification from a path list alone constitutes patch-equivalence proof.

| Name | Observed head | Ahead / behind | Disposition |
| --- | --- | --- | --- |
| `automation/20261121T0238Z/qa/settings-partial-import-drafts` | `a8c10a965f72` | 93 / 10 | #353 stacked settings-draft regression; owner existing; don't bulk merge 218 paths |
| `fix/ghostpay-disclosure-focus-recovery-20261120` | `0fb2831a1b89` | 465 / 76 | Privacy focus stack; GitHub comparison capped at 300; inspect incremental PR #355 |
| `fix/ghostpay-policy-record-seller-identity-20261121` | `05ac042d4ca4` | 6 / 0 | This independent GP-BUG-08 correction at census time; branch subsequently advanced to cleanup/handoff |
| `repair/ghostpay-privacy-browser-lifecycle-20261121-539818` | `8ce7f1db4521` | 463 / 76 | Overlaps focus #354/#355 and consent stacks; compare capped at 300 |
| `repair/ghostpay-settings-import-expectations-20261121-539818` | `82ab06f1bb6f` | 94 / 10 | Stacked settings expectation repair; overlap #353; inspect delta only |
| `audit/ghostpay-current-census-20261120-r2` | `53a33810a86c` | 0 / 16 | Ancestry redundant; source already incorporated into main by #330 |
| `automation/ghostpay-integration-lock` | `c196151daf82` | 22 / 118 | Integration lock/control data; compare capped at 300, never bulk merge |
| `integration/ghostpay-main-recovered-fixes-20261120` | `5a745d4b5fba` | 88 / 10 | Diverged multi-feature integration parent, 216 paths; review owned PR deltas |
| `integration/ghostpay-sweep-consent-20261120` | `2748c9bfd55b` | 97 / 42 | Stacked sweep/privacy candidate, 239 paths; avoid wholesale merge |
| `main` | `aec179910c39` | 0 / 0 | Current main |
| `test/ghostpay-wallet-attempt-reveal-after-reconnect-20261121` | `28f1e4bd0960` | 462 / 76 | #352 nested on #348/#336; 300-file GitHub cap; incremental privacy browser correction only |

The old 392 names **were not each re-compared to this newer main**, and prior comparison classifications remain pinned to their historical heads. The 26+2 earlier deltas were reconciled by name and SHA; 6 moving references were re-compared. Live work can change these counts; re-enumerate and re-pin before any merge. Some comparisons hit GitHub's 300-file limit.

## Overlap / qualification queue verified from hosted exact heads

- [#342](https://github.com/djshellshoxxx/GhostPay/pull/342) is a **test-only** repair stacked on [#340](https://github.com/djshellshoxxx/GhostPay/pull/340); four workflows passed at child head `06fd87c3e900`, but independent review is absent. Parent head `f9344a16fdef` still fails CI/Pages/Hosting/Beta: integrate corrected tests **into the parent first**, then requalify.
- [#351](https://github.com/djshellshoxxx/GhostPay/pull/351) corrects #337 stale popup expectations and had three supporting successes while main CI was queued at head `0750012546ae`; #337's original CI failed. Do not integrate parent uncorrected.
- [#352](https://github.com/djshellshoxxx/GhostPay/pull/352) preserves wallet-journal concealment until renewed consent; Pages and Beta passed at `28f1e4bd0960`, CI queued; stack is #336 → #348 → #352.
- #353's settings import tests and #354/#355's privacy focus work overlap their respective parent stacks. Review incremental diffs, not entire divergent heads.
- [#345](https://github.com/djshellshoxxx/GhostPay/pull/345) guards stale policy payment authority; separate **pay** subfeature from this record-identity fix, but compare common experimental-policy source before integration.
- Receipt PRs #332/#335 share archival logic: reconcile once. Preserve Tor/HTTPS static, noncustodial key boundaries and independent recovery guarantees.

## Next handoff

1. Verify this new PR's exact-head CI and source/test review. The new key-selection helper and `PolicyReceive` use must be reviewed for both seller keys, not merely policy hash.
2. If any TypeScript/lint/browser check fails, repair on this same branch, rerun exact SHA and keep draft.
3. Run targeted Vitest for `PolicyView.recordIdentity.test.tsx`, existing `PolicyView.*.test.tsx`, TypeScript, full/lean builds, static Pages and privacy checks. Verify separate record exports and imported/recovered duplicate feedback in the browser.
4. Integrate only approved and qualified **small PRs**, with integration lock and exact-head merge lease. Do not deploy, enable experimental policy, add mainnet functionality, move custody, or publish a release.
