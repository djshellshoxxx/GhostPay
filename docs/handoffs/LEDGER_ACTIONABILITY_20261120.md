# QC-01 reconciliation-ledger actionability — 2026-11-20 UTC

## Scope and exact sources
- Cycle: bounded GhostPay engineering / sequential test repair. No independent subordinate agent was available.
- Main/base: `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`.
- Isolated branch: `automation/20261120T1042Z/bug/ledger-actionable-activation`.
- Ownership claim commit: `0499ec87f0240e7b180b58300435f180ef696ab2`.
- Test implementation commit: `a4c4af5a4da74d6916ce02e4c457c1cfce013c7e`; test file blob `cdffc8230d996621ac89a05810b37aff50555b82` (verified by re-read).
- Source issue: QA-309 / QC-01, `docs/qa/2026-11-19-readonly/HANDOFF.md` in PR #309.
- Source file reviewed, not modified: `apps/web/src/components/ReconciliationLedger.tsx`, main blob `c190e0efeb942fb7bcb91f5e14f9f3e6c3df5d67`.
- Test file edited: `apps/web/src/components/ReconciliationLedger.test.tsx` only.
- Only ancillary edits: additive `docs/ai/ACTIVE_WORK.md` claim and this handoff.

## Correctness finding and repair
The existing import-preview UI deliberately renders an activation button while its asynchronous readState refresh is still pending. The button is disabled during this interval; a test that waits only for button presence can click too early and never retry. This was a timing-sensitive test synchronization defect, **not** a demonstrated production data-loss or funds-loss vulnerability.

Two existing historical-backup activation tests now wait explicitly until the displayed button is enabled before clicking. A new deterministic test pauses the next vault readState after a real backup preview, asserts that activation remains disabled and has not executed, releases the read, waits for actionability, clicks once, then checks exactly one activation and retained imported-untrusted provenance. Original historical/untrusted checks remain unchanged. No arbitrary sleeps, timeout adjustments, assertion relaxation, application, contract or protocol edits were made.

## Evidence and limits
- Live GitHub main ref and integration metadata inspected. Integration lock was **released at generation 7**, ref `93b50a03fea1f22ff9dc403099ce1eb09635299c`; no lock was acquired because no shared integration was attempted.
- GitHub compare `773a94be..a4c4af5a`: 2 commits, 2 paths (test: +46/-2 lines, ACTIVE_WORK claim: +12). Re-read test blob: zero previous presence-only activation expressions; three actionable enabled waits (two existing tests plus one new deterministic case).
- Read implementation `packages/ux-vault/src/reconciliation-portable.ts`: previewImport snapshots/decrypts but does not itself call `readState`; the held-read seam targets the component's post-preview run() refresh, not the preview algorithm.
- Direct git checkout failed: `git ls-remote https://github.com/djshellshoxxx/GhostPay.git main` returned `Could not resolve host: github.com`. GitHub connector reads and commits succeeded. Repository dependencies and Vitest were unavailable locally; **no repository tests, lint, typecheck, build or browser qualification executed in this invocation**. No independent review occurred.
- Main `773a94be` observed; current PR #278 `417f7c71` completed core CI/Pages but strict contract-analysis failed; PR #314 `740efcf0` has completed successful Pages, Hosting and Beta workflows while core CI queued. These other PR states are not validation for this change.
- PR-push workflow review: `.github/workflows/pages.yml` treats `pull_request` as validation only and dispatch deploy requires explicit main workflow_dispatch deploy=true; CI pull_request has no deployment permissions. No deployment/release triggered intentionally.
- Open PR changed-file lists #306/#307/#310/#314 checked for test ownership collision; no matching path found. Broader 299-branch historical audit not performed.

## Next cycle
1. Fetch exact current draft PR head and base. Run `npm ci --ignore-scripts` then `npx vitest run src/components/ReconciliationLedger.test.tsx --config vitest.nocov.config.ts` from `apps/web` (or the repository's preferred focused invocation), plus web typecheck/lint and full applicable CI.
2. Inspect all exact-head CI jobs, including browser and Pages acceptance. Repair real failures with test-first changes; preserve original assertions.
3. Obtain independent review of the held-read seam, false-green race potential, provenance assertions and final diff.
4. Reconcile with newer ledger modifications and coordinator ownership. Only integrate under atomic repo-wide lock and all required gates. Main may trigger other workflows; no automatic deployment is permitted.
5. Continue unresolved security/Mythril clearance and testnet/owner beta gates separately. Do not infer clearance from this test-only change.

No main merge, deployment, release, production change, real-funds operations, force-push, security waiver, paid API, external agent, or duplicate clipboard/signer work occurred.
