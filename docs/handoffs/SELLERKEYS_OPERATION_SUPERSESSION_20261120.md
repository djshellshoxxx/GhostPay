# SellerKeys operation supersession — 2026-11-20 UTC

## Current continuation — 2026-11-20

This section supersedes the historical checkpoint below. The repair remains in
[PR #314](https://github.com/djshellshoxxx/GhostPay/pull/314), addressing QA-01 from
[the QA report #309](https://github.com/djshellshoxxx/GhostPay/pull/309).

### Source and ownership

- Continued original PR head `740efcf061c1ca97a562b85be742dd59f3ad0911` in isolated local branch `fix/ghostpay-309-operation-ownership-20261120`.
- Refreshed against main `aa3df1cb37274fae73af0ca957183c15c51b62d3`; the only merge conflict was additive ownership documentation, and both entries were retained.
- First continuation published as `49535f3bdbdda6f133e397097e56a8dde8413d94`, with tree `9fe4ead0dcc42abb3d3726c760bfd1fb63316c70` verified identical to the local candidate. Follow-up test typing/cleanup and this evidence are published on the same PR through a fast-forward update with an expected-head lease.
- Final runtime blob: `d509e675dda2910850c4a95a5697761107807f69` (`SellerKeys.tsx`).
- Final component-regression blob: `05c846289be5827c2e9028c28661b1c2f242c9b0` (`SellerKeys.operation.test.tsx`).
- Final browser-regression blob: `78bc60dcd7e871166d632dd3b92302cc643eac8e` (`e2e/backup-ownership.spec.ts`).

### Completed repair

The original patch released export/import and verification flags but left an
obsolete unlock owning `vaultBusy`. That same flag also represented durable
save/delete writes, so clearing it indiscriminately was unsafe for correctness.

Cancellable busy state now derives from the current `{ kind, controller }` owner.
Cancellation retires that owner; completion releases it only when its controller
still matches. Vault saves and deletes have a separate synchronous ownership token
and retain their busy state across edits, cancellation, idle lock and session
replacement. Vault controls reflect either a pending unlock or a durable write.

Unlock ownership includes the asynchronous recoverability check. Its old response
cannot restart a cancelled unlock or interrupt a later write. An export whose
authorization finishes after supersession cannot start encryption. The session
effect still preserves the generation needed to acknowledge an import/unlock's
own successful key installation. No cryptography, passphrase policy, key custody,
storage format, workflow or dependency was changed.

### Executed verification

| Check | Result |
| --- | --- |
| Negative control on main `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5` | Four selected regression assertions fail as expected: export to verification and unlock to verification, with both stale-result outcomes. Other cases were deliberately filtered out. |
| Complete SellerKeys component selection | **74/74 tests passed across 7/7 files**, with no unfinished tests or worker errors in the final run. |
| New operation ownership cases | **17 cases**, included in that complete pass. Cover both stale success and rejection, retained newer state, authorization/preflight cancellation, lock/session/unmount and durable-write isolation. |
| TypeScript for changed runtime, component test, browser test and imported dependency graph | **Passed**, using the repository compiler options in a temporary scoped project. This is not a full-project TypeScript pass. |
| Repository ESLint rules on all three changed code/test files | **Passed** after explicit asynchronous test cleanup and browser-global typing corrections. |
| Lean static build and actual postbuild checks | **Passed**; 825 modules built and 17 output files scanned. The payment-uri workspace was rebuilt after refreshing main. |
| Committed-secret scan and whitespace check | **Passed**. |
| Independent agent source review | Reviewed runtime blob above; no remaining correctness blocker found. This is source review, not a third-party security audit. |

The final component command was:

```sh
cd apps/web
NODE_OPTIONS=--max-old-space-size=384 ../../node_modules/.bin/vitest run src/views/SellerKeys --maxWorkers=1
```

The lower heap bound applies to the runner and its forked workers. Tests, timeouts,
isolation and production KDF costs were unchanged. Earlier interrupted component
runs are superseded only by this complete 74-test run. All 654 installed dependency
versions were checked against the unchanged lockfile; no required package was missing.

### Remaining qualification gates

The two committed Playwright journeys delay native AES-GCM completion or the
uploaded file read, exercise both operation orders and verify cancellation/retry
using a real downloaded backup. Local Chromium aborted during launch with
`socket() failed: Operation not permitted (1)`. Neither test body ran locally.
The lean build/postbuild was executed separately; no browser assertion pass is claimed.

Full-project local TypeScript runs were interrupted by SIGKILL or JavaScript heap
exhaustion. The scoped pass above is explicitly narrower. Hosted CI must run the
full TypeScript, web-unit and browser gates on the final PR head. At the first
continuation checkpoint, the newly triggered hosted jobs were queued, not green.
Inspect the live PR checks for subsequent outcomes; previous-head checks do not
qualify the final head. Keep QA-01 awaiting browser qualification until those
journeys execute successfully. No main merge, deployment or release was performed.

## Historical checkpoint before the continuation

### Identity

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
