# Team A: CLI canonical-time reconciliation and CI repair

- Repository: `djshellshoxxx/GhostPay`
- Worker: `ci_reconciliation`, Caveman workflow; independent reviewer: `final_review`.
- Branch: `codex/unified-ci-reconciliation`.
- Base: `8298fc24296194f05b686b44bec542d10276c8d3`.
- Implementation: `e79821d3749f8244783389ada2e3c3ccc24b47bb`; integrated by the coordinator as `e8da90de`.
- Follow-on fixture: `612d3c35b8e3b42b73bfad6b1b39a0b72ca594ff`. the compiled operator RPC fixture supplies canonical header time and asserts its persistence. No further product change.

## Cause and change

The canonical-time matcher correctly refuses an exact invoice association without a verified block timestamp.
The CLI still constructed live reconciliation records directly from parsed raw observations, so it discarded header time even when RPC supplied it. Current-source reproduction produced 13 failures in the 26-test CLI command suite. Adding a valid RPC header time alone still left the positive proposal test failing, demonstrating a product integration gap.

`currentObservations` now reads a canonical header after payment and seller-ownership verification, checks its number and hash, and attaches only that header's time to the live record. Raw observation input cannot supply a timestamp. `freshCanonicalContext` checks number, hash, finality and the exact recorded time against every configured provider before publication. A missing or conflicting timestamp cannot produce a confirmable proposal. A payment mined before expiry remains matchable when the seller scans after expiry.

Six of fifteen browser invoice-ledger tests also failed because their supposed verified scan fixture omitted canonical time. The fixture now carries that time. A separate regression explicitly preserves the ambiguous result and absent confirmation action when canonical time is missing. The expiry assertion uses the current canonical-time disclosure. Product UI behavior and matching assertions remain unchanged.

The compiled CLI operator fixture had the same missing-header-time defect. Its selected reconciliation test reproduced `NO_EXACT_PROPOSAL`; the fixture now supplies time in the RPC header and asserts that the confirmed encrypted history preserves it.

## Modified paths

- `packages/cli/src/reconcile-session.ts`
- `packages/cli/src/reconciliation-fixtures.testutil.ts`
- `packages/cli/src/reconcile-time.test.ts`
- `packages/cli/test/operators.test.mjs`
- `apps/web/src/components/ReconciliationLedger.invoices.test.tsx`

## Validation

Results below apply to implementation `e79821d3749f8244783389ada2e3c3ccc24b47bb`; the later compiled-fixture-only change does not alter runtime source. Test counts overlap and must not be summed as unique coverage.

| Check | Result |
|---|---|
| CLI focused reconciliation: command, local, front-run and time suites | 52/52 passed, zero skips |
| Browser reconciliation ledger component suites | 36/36 passed, zero skips |
| CLI and web complete TypeScript typechecks | Passed |
| Dependency-ordered `npm run build:cli` | Passed |
| Scoped ESLint for all changed TypeScript/TSX files | Passed in separate CLI and web invocations |
| Real local CLI devnet acceptance | 124/124 passed, including 11 refusal assertions for unsupported chain 31337 |
| Full CLI unit suite and coverage | 570/570 passed, zero skips, 37 files; coverage 98.61% statements / 97.33% branches / 99.07% functions / 99.49% lines |
| Full compiled CLI acceptance | 21/21 passed, zero skips, at compiled fixture `612d3c35b8e3b42b73bfad6b1b39a0b72ca594ff` |
| Independent source review and canonical-time regressions | No blocker; 9/9 canonical-time tests passed at `e79821d3`, recorded by reviewer in `c3fbcb63` |

Native acceptance ran the unchanged `scripts/beta/cli-devnet.e2e.mjs` against private local Anvil nodes, using the pinned Anvil 1.8.5 and Solidity 0.8.28 build. It covered real invoice payment, scanning, proposal export, explicit confirmation, recording, receipts and history. The prior hosted failure at `reconcile propose --record --out` now passes. It is local-node acceptance, not public-testnet qualification.

The first combined lint invocation was killed with exit 137. Both subsequent scoped invocations completed successfully without changing lint rules. An initial native attempt used a separately started node whose process did not survive the tool boundary; startup and acceptance were rerun in one shell, completed with exit 0, and the private node was stopped. Generated deployment state was removed and the tracked devnet manifest restored; no test deployment is part of this change.

The completed validation commands were:

```sh
# packages/cli
vitest run src/reconcile-command.test.ts src/reconcile-time.test.ts src/reconcile-frontrun.test.ts src/reconcile-local.test.ts --maxWorkers=1
vitest run --coverage --maxWorkers=1
# apps/web
vitest run src/components/ReconciliationLedger.invoices.test.tsx src/components/ReconciliationLedger.test.tsx src/components/ReconciliationLedger.i18n.test.tsx --maxWorkers=1
# repository root
npm run typecheck -w @ghostpay/cli
npm run typecheck -w @ghostpay/web
npm run build:cli
node --test --test-concurrency=1 packages/cli/test/compiled.test.mjs packages/cli/test/operators.test.mjs packages/cli/test/build-info.test.mjs
node scripts/beta/cli-devnet.e2e.mjs
```

ESLint used the repository configuration against the four changed TS/TSX files in separate CLI and web invocations. `node --check packages/cli/test/operators.test.mjs` and `git diff --check` passed. All worker-owned execution handles completed before handoff. The full CLI run took 473 seconds with one worker and a 1 GB Node heap; thresholds were unchanged.

## Independent review and remaining scope

The reviewer inspected every live reconciliation caller, strict raw observation parsing, fresh-header authority, imported-history separation and all publication guards. No blocker was found in the pinned implementation. Missing time remains nonconfirmable; timestamp-free legacy data remains readable. No authority, custody, chain trust, translation status, test threshold or release gate was changed.

Next action: integrate the fixture and this evidence, then run the coordinator's combined candidate checks and refreshed hosted CLI/operator CI. Real external providers and release qualification remain separate gates. No worker process or background continuation is promised by this handoff.
