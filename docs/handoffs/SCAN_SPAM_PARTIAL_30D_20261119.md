# Cycle 20261119T1640Z — 30-day privacy-set coverage warning

Target: static GitHub Pages browser beta; no external services or real funds.
Source main: `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
Task branch: `automation/20261119T1640Z/bug/scan-privacy-partial-30d`.
Worker: one ChatGPT coordinator, with sequential source inspection, test-first repair and read-only audit; no independent concurrent agent or independent approval.

## Finding and change

`apps/web/src/lib/scanSpam.ts` original blob `0cf63cb855bb80e1dcf1e2b9f511c8758b124558` exposes a `count7d`, `count30d`, and `partial`. Previously `partial` checked `scannedFrom > max(0, from7)`, even when 30-day history was not covered. A ten-day scan could show a 30-day count without the "real number may be higher" warning. The local privacy-set estimate is explicitly heuristic, not an anonymity guarantee.

The narrow repair changes the lower bound to `max(0, from30)` while preserving the existing head-completion check and existing counts/level logic. The new source blob is `da35b619ad1aa7efa8607e0ab9ce8278b585bd61`. No cryptographic, network, fee, storage or scan policy is changed.

Commits:
- Ownership claim before source edits: `f1748872c5bcb82ba70e04a7b0414d66b2cdb37b`.
- Four-case regression suite committed first: `08e2d465616d9233f5442ed0ee748a7ee74a66db`; blob `ceeba44eb5156581c4fa9c65b3104109306bff1e`.
- Narrow source fix: `be74b36efc1df3d3c39d1ade9c810cd282e44b87`.

## Evidence and limitations

Executed Node 22 standalone **JavaScript transcription** of the exact pure coverage calculation, using a 12-second block time. One of four cases failed as expected on the seven-day baseline (missing ten-day scan warning); all four passed against the thirty-day correction. The separate predicate-only probe passed five boundary assertions. These are **not** executions of the committed Vitest test or full TypeScript module.

`git ls-remote https://github.com/djshellshoxxx/GhostPay.git HEAD` failed locally due to DNS resolution; no repository checkout, local Vitest, workspace typecheck/lint, browser checks or full CI pass is claimed. Hosted exact-head checks and an independent reviewer are required. No CI result is claimed before execution.

Main remained `c977b5d6723f6822c3b5d86cd6b231712c53c395` at the latest read. The metadata-only integration lock remained released, generation 3; no lock was taken. Inspected active PR file inventories including #278 (1259 changed paths), #264, #246, #238, #244, #251, #248, #249, #222, #219, #250, #269, #270, #279 and #280; none edited the two owned scanSpam paths. This is targeted active-PR coverage, **not** a full refreshed historic branch equivalence census.

Inspected source-side trust boundaries in `opStackFee.ts`, `merchantTemplate.ts`, `scanSpam.ts`, and relevant privacy tests during selection. No additional confirmed security vulnerability established and no external security audit performed. Shared security/branch ledgers are unchanged.

The Pages workflow has validation-only pull-request execution; deployment is explicit workflow_dispatch with `deploy=true` on main. Release workflow triggers on tags. No merge, tag, release, deployment, production setting or mainnet operation was attempted.

## Resume

1. Check current branch head, PR ownership, source drift and exact-head CI including Web/Pages privacy checks.
2. Execute `apps/web/src/lib/scanSpam.partial.test.ts` through the repository Vitest runner and targeted workspace typecheck/lint on a real checkout. Confirm baseline first test fails and fixed first test passes.
3. Have a separate verifier review accuracy of the 30-day partial semantics and any existing tests, and ensure privacy copy is consistent.
4. Reconcile with newer main and active integration owners. Only a lock-holding coordinator may merge a fully qualified candidate after the deployment/ruleset gates are fresh.
