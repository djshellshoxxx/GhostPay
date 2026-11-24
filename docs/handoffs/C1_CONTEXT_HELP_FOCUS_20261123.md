# C1 contextual RPC help keyboard focus — isolated repair (2026-11-23 UTC)

## Exact source and scope
- Task branch: `automation/20261123T1239Z/bug/c1-context-help-focus`; parent C1 draft PR [#504](https://github.com/djshellshoxxx/GhostPay/pull/504), head `cdf1510116d84855ef6e579f80e0e05a0fb1a5f1`, default branch `main` `8ddb344973e80b8e1eda6821e970ee6a2b808b29` as inspected.
- Claim commit: `477d1bba0f1ef76ef938ca67b518e36057440fbc`.
- Test repair commit: `835f8482cd95560b9c6cda0b02a49fea4a494e8e`; resulting `apps/web/e2e/contextual-help.spec.ts` blob `8f60db503796120d6276251c7abde22849887863`.
- Owned paths only: this report, additive `docs/ai/ACTIVE_WORK.md`, and `apps/web/e2e/contextual-help.spec.ts`. No parent changes, code changes, workflows, deployment or shared-ledger writes.
- One sequential coordinator/reviewer executed these steps; no native subagents or independent reviewer.

## Reproduction and reasoning
- Exact-parent [Core CI run 45151780276](https://github.com/djshellshoxxx/GhostPay/actions/runs/45151780276), jobs `137614785405` (full) and `137614785421` (lean), failed `contextual-help.spec.ts` at the assertion expecting `Test Base Sepolia` to be focused after one Tab from primary RPC help. This is a hosted runtime failure (not reproduced locally).
- At parent source, `Settings.tsx` blob `bfa9d2e3ecdc32c69335771e537e7210cefe46bf` renders primary RPC `Field` (input + help button), a **secondary RPC URL input**, then `Test Base Sepolia`. The old test skipped the newly added secondary input; that keyboard behavior would also violate normal tab-order accessibility if implemented.
- Repair keeps the Escape/Enter help behavior, accessible description, tooltip hidden/aria-expanded checks and value preservation. It asserts that Tab focuses the secondary input and dismisses help, then Tab focuses the Test button. The secondary is located relative to the row containing the already-selected primary field, avoiding cross-chain misselection.

## Verification and actual limits
- Static exact-source assertion after commit: **passed**; observed test steps in order and primary/secondary/Test DOM order on the parent at known blobs. This is source inspection, **not** executed Playwright, Vitest, typecheck, lint or full runtime verification. Earlier incorrect bounded static-check script was corrected by enlarging its source slice; final static ordering check passed. No false browser-pass claim.
- Native repository checkout unavailable because `github.com` DNS did not resolve in this execution environment. Did not retry a prohibited Chromium/socket workaround.
- Full/lean Playwright, React and wallet/browser acceptance for **this child head** remain pending GitHub-hosted CI; use exact child PR head, not parent results, and read per-job steps/logs after completion.
- Parent C1 still fails independent `Sweep.test.tsx` dry-run warning assertion and `settings-rpc-reflow.spec.ts` 900px vertical input alignment (24px versus <12px). Neither is modified; no gate is weakened.
- Separately inspected [PR #507](https://github.com/djshellshoxxx/GhostPay/pull/507) unchanged head `f8e40f9d773333c123ed93db2a256b4b2ee75dde`: its [Core CI 45158563270](https://github.com/djshellshoxxx/GhostPay/actions/runs/45158563270) has 24/24 successful jobs, [Pages 45158563298](https://github.com/djshellshoxxx/GhostPay/actions/runs/45158563298) has successful build and anvil browser acceptance, deploy/release/postdeploy skipped, and [Beta 45158563180](https://github.com/djshellshoxxx/GhostPay/actions/runs/45158563180) succeeded. These are separate PR #507 results, not qualifications of this change. Independent approval remains outstanding.

## Gates, coordination, continuation
- The integration lock at `automation/ghostpay-integration-lock/integration-lock.json` was read as generation 12, `status: released`, owner `claude-keen-volta-8ctx9x`. No lock was acquired or changed. Do not treat release as authority to merge without atomic lease ownership and refreshed SHA checks.
- Create an isolated *draft child PR targeting C1 head branch* `nodata/determined-allen-x5n560`, notify its coordinator and avoid directly updating that branch. Parent's existing failed exact-head CI is preserved. If the parent moves, compare new head/overlap before porting.
- Required next steps: inspect exact-child CI, ensure both E2E browser variants confirm secondary focus and Test focus; independently review; coordinate upstream integrator to cherry-pick/merge only this tested fix; repair parent Sweep and RPC-layout failures separately; only merge to main after all required independent/security/deployment gates and an owned atomic integration lock. Security/Mythril findings and external beta acceptance remain open.
- No main merge, deployment, contract change, dependency change, force-push, release, real wallet or funds operation.
