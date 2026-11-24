# R62 — evidence-backed retired history transitions and uncapped donor recovery

Checked at **2026-11-23T11:07:48.019Z** (immutable branch/PR snapshot). Main: `8ddb344973e80b8e1eda6821e970ee6a2b808b29`. PR #471 pre-publication HEAD: `bbec56d8086eb9406d816a0eeb9866ab84e20daa`. The R62 ledger was published as commit `370e621e441329d2cbb4a41cbd4d98713dcde73f`, which necessarily advances its own donor branch beyond the frozen snapshot.

## Actual consolidation validator repair

Two test-first source commits on PR #471:
- `56df23e1beac9a9f93f06b69f2aa20eed7bde43e` — new regression fixtures for retired history finalization, invalid proof, immutability, regression, and inaccurate counts.
- `bbec56d8086eb9406d816a0eeb9866ab84e20daa` — production validator fix in `scripts/consolidation/validate-ledger.mjs` requiring `checkedDonorSha`, `previousDisposition`, `comparedWithSha`, nonblank source proof and assessment when a formerly unresolved retired history becomes finalized. Original 404 evidence, identity and prior classifications cannot be silently rewritten. Optional `newlyFinalizedRetired` accounting tracks the transition without altering live-branch finalization totals.

Old validator enforced `successor.finalized === row.finalized` for *all* historically deleted refs, preventing any future source-qualified resolution of retired unresolved branches. The fix makes legitimate completion possible but does not auto-finalize a single donor.

**Actual validation:** evaluated the *committed source* and complete 28 test definitions in direct V8 with Node imports replaced by in-memory shims: **28/28 passed, 0 failed**. Independently evaluated `validateLedgerTransition(R62,R61)` from committed production source: PASS, result `{"total":573,"finalized":316,"unresolved":257,"openPRs":262,"stackedPRs":94,"mainSha":"8ddb344973e80b8e1eda6821e970ee6a2b808b29","globalUnresolved":259,"newBranches":2,"advancedHeads":1,"newlyFinalized":0,"newlyFinalizedRetired":0}`. Native Node, full application, browser and exact-head hosted CI are **not** claimed by this V8 verification. No application or shared main changes.

## Deleted branch source investigation — not finalized

- Closed, **unmerged** PR [#207](https://github.com/djshellshoxxx/GhostPay/pull/207), deleted ref `dependabot/github_actions/actions-b9ade1236b`, last immutable commit `199ab7ef1e80e6368fdc17c09b94c87a62871861`: **1 ahead / 205 behind** versus current main, **five** workflow file changes (uncapped). Proposed `actions/setup-python` v6.3.0→v7.1.0 in CI, contract analysis and nightly; `peter-evans/create-pull-request` v7→v8.1.3 in two automation workflows. Main's five exact files still use the old pinned SHAs. This is *unintegrated* dependency/tooling work; do not declare redundant, complete or safe without workflow CI and major-version compatibility review.
- Closed, **unmerged** PR [#210](https://github.com/djshellshoxxx/GhostPay/pull/210), deleted ref `dependabot/npm_and_yarn/npm-minor-patch-71cdd1547c`, last immutable commit `3c95b2a00bdcfb45dd36242ff40c133dd19d1811`: **4 ahead / 175 behind**, changed workspace manifests, lockfile, dependency qualification records and versions (viem 2.57.13→2.57.19, Vitest and coverage 5.0.5→5.1.0, others). The dependent alignment/reconciliation evidence includes different approved heads; do not transplant only the root lock or claim it is present in main. Needs a fresh paired current-main dependency evaluation and full build/CI. Both deleted histories stay *unresolved*; original immutable 404 proof is preserved.

## Untruncated recursive donor-tree investigation

Compared all Git blob identities using `GET /git/trees/<SHA>?recursive=1` with **truncated=false** for all targets. Baselines: main `8ddb3449...` **3,987** blobs; unmerged recovery PR #372 `055d33e0...` **5,762**; unmerged C1 #504 `cdf1510...` **4,220**. A donor-only blob means no *identical SHA* across these three complete target trees, not that its feature is absent from every other PR or that it should be imported. This is a triage of previously incomplete/capped history, not behavioral equivalence or release acceptance.

| Historical unowned donor (exact SHA prefix) | Total blobs | Donor-only SHA blobs | Unmatched in code/config/test areas |
|---|---:|---:|---:|
| `evidence/ghostpay-web-qualification-20261120` `6152dd03` | 4,061 | 26 | 22 |
| `evidence/ghostpay-remediation-20261120` `6fe35de4` | 5,230 | 329 | 119 |
| `evidence/ghostpay-idle-session-r2-20261120` `ebc3fea4` | 4,111 | 69 | 38 |
| `codex/ghostpay-private-scan-lint-20261119` `1b010ec9` | 4,535 | 142 | 135 |
| `codex/ghostpay-export-authorization-20261119` `b0abb726` | 4,539 | 144 | 137 |
| `automation/20261120T003500Z/coordinator/qualification-evidence` `52122f8b` | 4,952 | 191 | 120 |

Examples of unmatched, potentially security-relevant sources: `apps/web/src/views/Sweep.test.tsx`, `apps/web/src/lib/scanPrivacy.ts`, `apps/web/src/lib/keyVault.ts`, `apps/web/src/views/SellerKeys.tsx`, `apps/relayer/src/privacy.test.ts`, multiple sweep/TRON hardening tests, and old relayer sources. Some may reflect older superseded implementations; their exact feature deltas require bounded source-level review against current owned PRs before any cherry-pick. **All six donor histories remain unresolved; none were swept into main or discarded.**

## Current ownership and gating

- New BUG-only #506 `141c6556ead107b1f622a1c3d89cdfc6004e1f92`: 4 ahead / 0 behind, four changed files, i18n duplicate quality weights; owned.
- New BUG-only #507 `f8e40f9d773333c123ed93db2a256b4b2ee75dde`: 5 ahead / 0 behind, four changed files, snapshot Solana reference validation; owned.
- P0-B refund lifecycle branch `85cc394451313e24104ef7089379e720b4e70526` remains owner-held with trusted-finality absence-proof review required. P0-A #500 `d3bbc9aa555fa9f8eaea31ddc8c6d6e5e7a232ea` remains owned/draft.
- Draft C1 #504 `cdf1510116d84855ef6e579f80e0e05a0fb1a5f1` still fails full and lean browser checks in [CI #45151780276](https://github.com/djshellshoxxx/GhostPay/actions/runs/45151780276), including RPC keyboard focus and 900px alignment. Some other workflows passed but **C1 is not qualified**.
- GitHub branch protection read yields HTTP **403**. Main's generic branch listing `protected=false` does not establish permissions or legal merge gates. The generation-12 integration lock was recorded released at R61; do not assume acquisition of a later generation or independent approvals. No merge attempted.

## Census and invariants

At 11:07:48Z, complete branch pages **100/100/100/100/100/73/0**, all 573 independent `/git/refs/heads` exact SHA matches; open PR pages **100/100/62/0**, **262** open, **94** stacked. 316 structural finalizations, 257 unresolved live, two retired unresolved = **259 globally unresolved**. Two new owned BUG-only histories offset zero new finalizations; the only old-head advance was this worker's PR #471 `3337d1ad...`→`bbec56d8...`, before R62 publication. No change to protected-main HEAD at census.

This is source analysis and actual consolidation-tooling engineering, **not** application-feature integration. No production change, main merge, deployment, release, branch deletion, force update, real-funds test or invented approval.
