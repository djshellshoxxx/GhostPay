# GhostPay — display-safe truncation at a Unicode surrogate boundary

## Exact source-pinned engineering checkpoint — 2026-11-21 UTC

- Cycle: `20261121T1835Z` (started ~18:35Z; evidence updated 18:39Z).
- Execution: one coordinator performing separate sequential audit, implementation, test-replay and reconciliation phases. **No independent native agents, no Caveman runtime, no independent approval**.
- Task branch: `automation/20261121T1835Z/bug/display-surrogate-cut`, based on verified `main` `eb59d93cffed7848c4aac37d0e9650b87239c6da` (still unchanged on final pre-handoff read).
- Ownership committed first at `992b87369143aaf2144f520eaf1e2dd29e6e6065`, in `docs/ai/ACTIVE_WORK.md`. Test-first commit: `4394a9b7096f7fb13e9c805248f7340d8ea5245c`; production correction: `240ad700353c22f2e176a3d8ed736cf205099f46`. Product blob: `d8a58f7802ba24fdf6b9c140fb00fc11e86e22a0`; regression blob: `5992d5ae3e2104141eee87f24e2a9149e532f432`.
- Exact product scope: `apps/web/src/lib/displayText.ts`. New distinct test file: `apps/web/src/lib/displayText.truncation.test.ts`. No existing test file, invoice schema, crypto, contract, dependency, wallet behavior, network path, production configuration or deployment workflow modified.

## Finding GP-DISPLAY-BOUNDARY-01

Severity: low (presentation correctness); confidence: high on baseline logic; exploitability: unestablished. A valid supplementary Unicode character crossing the `safeText()` 4096 UTF-16 code-unit truncation boundary was sliced into a lone high surrogate. The already-existing sanitiser then correctly escaped the now-*artificially created* surrogate as `⟦U+D83D⟧`, making an otherwise valid emoji in an overlong invoice memo appear hostile. This finding does **not** establish a payment, signing, privacy compromise or funds-loss exploit.

Test-first regression expects overlong text ending with a valid split surrogate pair to omit that entire pair, keep `flagged: true`, and avoid the false surrogate marker. Two neighboring cases preserve a complete emoji within the limit and continue visibly escaping a genuinely lone surrogate. A fourth checks exactly-limit clean text.

Minimal source fix tests the boundary's final high surrogate and following low surrogate; only for that **valid pair** it drops the cut high surrogate. All other sanitization, actual hostile-marker behavior, text length policy and signed bytes remain unchanged.

## Executed evidence and limits

- **Executed** local Node 22 baseline reproduction against JavaScript UTF-16 slicing: a 4095-unit prefix followed by emoji U+D83D U+DE00 produced `slice(0,4096)` ending in lone U+D83D; `/\\p{Cs}/u` matched it.
- **Executed** five Node 22 *source-equivalent* assertions in `node --test /tmp/ghostpay-display-cut-equivalent.test.mjs`: baseline shows fake marker, fixed equivalent omits split pair, whole pair retained if it fits, true unmatched surrogate visible, clean exactly-limit string unchanged. **5/5 passed**. That file is temporary and **not a repository test**.
- **Committed**, **not executed locally**: four Vitest regression scenarios in the new file. Git clone is blocked by DNS: `fatal: unable to access https://github.com/djshellshoxxx/GhostPay.git/: Could not resolve host: github.com`. No repository Vitest, ESLint, TypeScript, build, browser, Mythril or full security run can be claimed locally.
- Exact-head GitHub CI is required after PR creation. No assertion about hosted passing tests is made at this checkpoint.
- **Independent verification: outstanding**. Self-review and a copied equivalent script do not count as separate worker or formal third-party review.

## Concurrency, consolidation and security

- Checked active PR #307, #278, #372, #384, #405, #416 and adjacent PR file inventories before editing. Broad #278/#372 touch `apps/web/src/lib/displayText.test.ts`, not the newly created focused test nor the production file. They remain externally owned. This is a bounded check, not an exhaustive semantic audit of all open branches.
- Current lock source: `integration-lock.json` on `automation/ghostpay-integration-lock`, **held** by `994a0d214fb9-root-r3`, generation **11**, on readback. Expiry is not permission to steal ownership. No metadata update, shared tracker write, protected branch integration or main merge.
- Existing `docs/ai/HANDOFF.md` is only a template; legacy docs and audit ledgers retained unchanged. The canonical `docs/automation/MASTER_STATUS.md` and `WORKER_HANDOFFS.md` were absent from current main; no competing global ledger created while integration ownership is external.
- Inspected Pages workflow: pull_request validates but does not deploy; Pages publication requires `workflow_dispatch` on main with `deploy=true`. No dispatch, release, tag, wallet transaction, paid worker, secrets or production setting changed.
- Separate open confidentiality issue #414 remains unresolved; this isolated display repair is not security clearance or a fix for that finding.

## Next-cycle handoff

1. Verify current PR/source head and all **exact-head** GitHub workflow jobs. Reproduce and repair any failing tests on a separately claimed task branch while respecting active owners.
2. Run the committed `displayText.truncation.test.ts` plus existing `displayText.test.ts`, typecheck, lint, build and relevant browser review in a real checkout; seek a truly independent verifier for Unicode boundaries and signed-input behavior.
3. Recheck active #278/#372 integration and lock ownership; reconcile only through the authorized coordinator with fresh SHAs and full applicable gates. The branch remains isolated until then. Do not deploy or merge to main to bypass gates.
