# SellerKeys operation supersession — 2026-11-20 UTC

## Identity

Cycle: 20261120T0835Z. One coordinator performing sequential repair; no independent agent or reviewer executed.
Branch: automation/20261120T0835Z/bug/sellerkeys-operation-supersession
Main base: 773a94be1c8328d6fa1720ae48f1b6a2d903f0c5
Original SellerKeys blob: 437c684af1fac0f759607bb3fe4f8e37238a3d89
Corrected runtime blob: 737202824f30f147eef32cf4b7b7537560cc3fb7

- Ownership claim: d2923ec33b1963ccca0db2fcd0a2b521acf8a47f
- Regressions committed before source: e0f686357bac06b7192900995d21b9f5475baf53
- Production fix: 1bc7eb21c1b07195f8e09fcfe8f8605a3618bd68
- Test mock return-type fix: f372539be4dab98eb6b3832083152326fe64e9ef
- Unmount-safe correction: 7f7524a4c197c461c3c173dafcf592b0858e0180

Owned paths: apps/web/src/views/SellerKeys.tsx; new SellerKeys.operation.test.tsx; additive docs/ai/ACTIVE_WORK.md; this handoff.

## Prior evidence and current work

Existing [QA PR #309](https://github.com/djshellshoxxx/GhostPay/pull/309) has two reproduced failed ordinary-ordering tests and two passing controls on the old main source. That is previous work, not tests newly executed by this cycle. Source is described in docs/qa/2026-11-19-readonly/BROWSER_QA.md and HANDOFF.md on that PR.

The shared operation AbortController cancelled prior export/import/verification, but stopOperation did not clear the prior form's own busy flag. Old asynchronous callbacks correctly returned without clearing it and a form remained stuck. The correction captures the cancelled operation kind, and only clears export/import busy or verification busy while mounted. The existing controller/generation guard still prevents outdated completion, and the patch deliberately does not touch persistent vault save/delete writes.

Two committed jsdom/Vitest cases hold async seams for export -> verification with late rejecting export, and verification -> rejecting export with late rejecting verification. They assert actionable controls and no obsolete Cancel verification. The export mock was corrected to the actual asynchronous authorization return type.

## Actual execution and limits

Read exact blobs and tested types against the source using connected GitHub. Inspected SellerKeys existing tests for single export, explicit cancel, lock/unmount and independent vault delete. No committed Vitest, repository TypeScript, ESLint, web build or Playwright check was executed in this environment. Local Node 22 and global TypeScript were available, but React/Vitest checkout was not: direct git access failed DNS resolution. Source inspection and previous QA regression evidence do not count as fresh test passes. No separate verifier ran.

The pre-existing vaultBusy flag is shared by unlock and durable vault writes. This change does not automatically clear vaultBusy for unlock cancellation: a safe revision needs explicit write ownership and separate tests before changing that flag.

## Current integration control and dependencies

Last read integration-lock metadata ref SHA 93b50a03fea1f22ff9dc403099ce1eb09635299c was released, generation 7. Re-read live ref before any integration. The lock ref is metadata-only and must never be merged or deleted. PR #278 (recovery), PR #293 (privacy), and #306/#307 (integration) remain other-owned. This branch is isolated and must be compared to their current heads before integration.

The security policy says no independent third-party audit exists. No main merge, production deployment, release, token movement, force-push, analyzer suppression or paid coding-agent execution occurred.

## Next cycle

1. Re-fetch the draft PR exact head, current main, lock and CI jobs.
2. Run the new SellerKeys.operation.test.tsx and existing SellerKeys.test.tsx, SellerKeys.lock.test.tsx and SellerKeys.completion.test.tsx via repository Vitest. Then run TypeScript, ESLint, build and applicable browser checks.
3. Verify both supersession orders including late resolve/reject, explicit Cancel, session/idle lock, unmount and concurrent vault save/delete. Repair actual failures without weakening assertions.
4. Obtain genuinely independent security/correctness review. Do not mark QA-01 resolved until independently verified.
5. Keep QC-01 ledger timing and other remaining findings separately owned; reconcile newer PR #311 and #313 URI fixes without duplication.
6. Recheck external integration ownership, deployment triggers, repository gates and fresh exact-head checks before any eligible merge.
