# GhostPay R51 — security-source triage and validator regression, 2026-11-23 UTC

**Scope:** Source-pinned continuation of [R50](../20261122-r50/HANDOFF.md). Integration owner remains generation 11; do not modify main, the recovery stack or BUG-only owners.

## Completed: fail-closed recovery donor evidence check

Prior `scripts/consolidation/validate-ledger.mjs` accepted a historical finalized disposition `retained-in-unmerged-recovery-PR…` based solely on the row's claimed `evidence.parentHead`, without checking whether the referenced PR actually existed and still pointed at that exact head. This could leave a historical branch incorrectly marked resolved after the recovery PR was rebased, replaced, closed or otherwise moved, masking unintegrated code.

Verified a synthetic reproduction **against the unmodified R50 implementation**: finalized=true and a mismatched evidence parent SHA still passed, with self-consistent 2-branch and 1-PR inventories. Added a regression first, then repaired the production validator: each finalized unmerged-recovery donor now requires `evidence.parentPR` or `parentPr` to be a valid positive number naming an *open PR in the frozen census* and `evidence.parentHead` to equal that PR's head SHA. Existing proof also requires `mainIntegrated:false` and `behavioralEquivalenceNotClaimed:true`. No live GitHub refs are changed by validation.

Source commits on [PR #471](https://github.com/djshellshoxxx/GhostPay/pull/471):
- `880e26221a0b4058eb8235d25f4165a25a454354`: test-first regression demonstrating moving/absent/unpinned recovery parent.
- `d050c1d6850b7b37c9a02d79d6218c02586effbc`: invalidate stale/absent recovery parent SHA evidence.
- `6c63e9b7fc45e9e1c43616d90add9cedf12a140c`: adapt the existing *valid* recovery fixture to explicit PR number and matching current SHA.

Verification: evaluated the exact latest GitHub source as pure JavaScript in a V8 isolate using Node-strict-assert-equivalent implementations, after stripping only Node imports and CLI bootstrap. **14/14 declared regression tests passed** (zero failed). The corrected validator accepted the complete source-pinned R50 ledger (**552/309/243, 244 PRs**), and independently validated the new full R51 ledger (**553/309/244, 245 PRs**). This is **not** a claim of executing Node's native test runner, complete application tests, browser E2E, security CI or a true independent formal review. Those gates remain required.

## Examined older security donor, without unsafe import

Donor `codex/ghostpay-security-audit-20261030`, SHA `63994db6cff8b3b3ca698427eee9e95904230546`. Immutable comparison against main `eb59d93cffed7848c4aac37d0e9650b87239c6da`: **ahead 5 / behind 1,385**, exactly **15 changed paths** (not capped).

Read actual changed source and tests, compared relevant functions and Git blob SHAs to current main and unmerged recovery #372. The historical donor implements descriptor-pinned, bounded relayer secret reads; current main now centralizes that functionality in `packages/relayer-guard/src/secrets.ts` with `O_NOFOLLOW`, `O_NONBLOCK`, `fstatSync` and bounded `readSync`, so importing the old `apps/relayer/src/secrets.ts` would reverse a shared-module refactor. The donor's `halted` RPC signal is now represented in main by a **different** fail-closed `executionReverted` flag and `reportsExecutionRevert` logic. Main also contains AR2 regrowth logic that resets `served`, with a cap-aware guard stronger than the old unconditional reset.

These are **path-specific supersession findings, not whole-branch equivalence**. Remaining paths include the older relayer deadline-order, fee-oracle behavior and regression cases; the current Pages beta's fee-path refactor and current tests have not been fully reconciled. **Leave the donor unresolved**, preserve all history, and inspect only with any relevant owner before selective recovery. Do not import obsolete backend-custody or non-Pages services into the Pages beta.

Second immutable comparison: `evidence/ghostpay-continuation-r2-20261120` SHA `c2b575e945b71563e30a9bef162cf3fdc92181f0` vs `evidence/ghostpay-web-qualification-20261120` SHA `6152dd035822fe6ee97fba712ef1c37434e19035`: behind 1, ahead 2, only two changed docs paths. Their **inherited** browser/source trees still differ from main; do not blanket finalize either history as docs-only.

## Owner and integration hold

The dedicated BUG-only worker owns newly discovered [#486](https://github.com/djshellshoxxx/GhostPay/pull/486) and other current bug PRs. Recovery [#372](https://github.com/djshellshoxxx/GhostPay/pull/372) owns custody, Sweep, privacy and Mythril work. Scanner [#466](https://github.com/djshellshoxxx/GhostPay/pull/466) owns its separate GitHub ownership-scanner implementation. This R51 change is confined to **the existing consolidation PR #471 and new consolidation documentation**. The integration lock is still `held`, generation 11, owner `994a0d214fb9-root-r3`, ref `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79`. Expiration is not release. Branch-protection details return GitHub API 403; no enforcement assumption.

No protected-main merge, application-code change, deployment, real-funds test, forced ref update or skipped security-gate waiver occurred.
