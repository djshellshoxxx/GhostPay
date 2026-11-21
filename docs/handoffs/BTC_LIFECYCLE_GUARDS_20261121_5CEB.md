# BTC wallet lifecycle and worker-result guard recovery

## Outcome and exact source

Three selectively recovered safeguards are implemented on an isolated child of
the recovery/privacy candidate. The current per-output spentness model, endpoint
authorization, light-scan disclosures and original assertions remain intact.
Application changes are ready for the coordinator's exact-source hosted gates;
this handoff does not claim merge or release qualification.

| Identity | Value |
|---|---|
| Local base | `783231a46840cd869e39bd704751d4ab4c349c45` |
| Public parent | PR #372, `055d33e042c63edf1d5bbbdd7833d3c1ef93733d` |
| Shared base tree | `65e5cc6fdb7ab3337951ba0b0b58e87b71df095b` |
| Claim commit | `28c707f53708913eb241b3f963977ab01cae82ef` |
| Frozen product/tests | `c503534fa904c32a1071038b5cfe08a778b7bdda` |
| Frozen product tree | `595be477d20ac27b1c62d7ef92d3cd34299b0053` |
| Branch | `repair/ghostpay-btc-lifecycle-20261121-5ceb` |
| Donor | PR #244, `981cc2f4395d2d76c499a5cd46387daaaa3a6b1f` |
| Matching donor alias | `7954f1e5a29988fb9239225d1f829c6c3dc71e08` |

All three relevant production blobs match between the donor and its qualified
alias. Live PR heads #244 and #372 were rechecked. PR #244's base.sha metadata
was stale: root independently verified live main as
`eb59d93cffed7848c4aac37d0e9650b87239c6da` through the Git ref, ls-remote and
commit collection. No rebase or remote mutation was performed.

## Changes and compatibility decision

- `apps/web/src/features/btc/BtcView.tsx` clears optional per-output provider
  consent after successful wallet installation and on manual/application lock.
  Endpoint-change revocation and mandatory disclosed light-scan checks remain.
- `apps/web/src/features/btc/esplora.ts` requires a safe uint32 output index
  before requesting the selected provider's spent-status endpoint.
- `apps/web/src/features/btc/scanWorkerClient.ts` binds returned range and
  discoveries to the request and checked headers, requires complete checked-tip
  coverage for local status, rejects duplicate outpoints and checks coherent
  bounded recovery-window metadata. Existing cancellation and tweak cleanup stay
  unchanged.

The current scanner's block list includes retained per-output spent-coverage
anchors. A resumed scan with saved state through height4 and an explicit earlier
cutoff2 can legitimately retain a checked anchor at4. The recovered guard therefore
binds all returned block/anchor hashes to the checked chain and its tip while
keeping discovered outputs within request/result bounds. The ordinary inline
worker compatibility test exercises this case and verifies retained
`spentCheckedThrough` metadata. The donor's older global spentness model, separate
light-mode checkbox and transport implementation were not adopted.

Three new adjacent test files cover session consent, output-index boundaries and
valid worker range/pagination contracts. Every pre-existing test file, package
source, dependency input and workflow remains byte-identical to base. No original
assertion, timeout, coverage threshold or gate changed.

## Actual author executions

All tests ran on frozen `c503534f` with the original Vitest configuration,
`NODE_OPTIONS=--max-old-space-size=1024`, `--coverage=false`, and `--maxWorkers=1`.
No test was run on vulnerable historical source.

| Complete focused selection | Passed | Failed | Skipped | Files | Elapsed seconds |
|---|---:|---:|---:|---:|---:|
| New lifecycle, output-index and worker-compatibility files |17|0|0|3|9.278|
| Existing worker, Esplora, resume and spentness files |88|0|0|5|16.636|
| Existing wallet consent, secret lifecycle, ownership, persistence and oracle files |20|0|0|6|26.062|
| **Total distinct selected cases** |**125**|**0**|**0**|**14**| |

From `apps/web`, the three exact selections were:

```sh
../../node_modules/.bin/vitest run --coverage=false --maxWorkers=1 src/features/btc/BtcView.lifecycleConsent.test.tsx src/features/btc/esplora.outputIndex.test.ts src/features/btc/scanWorker.resultCompatibility.test.ts
../../node_modules/.bin/vitest run --coverage=false --maxWorkers=1 src/features/btc/scanWorker.test.ts src/features/btc/esplora.test.ts src/features/btc/esplora.isolation.test.ts src/features/btc/scan.resume.test.ts src/features/btc/scan.spentness-completion.test.ts
../../node_modules/.bin/vitest run --coverage=false --maxWorkers=1 src/features/btc/BtcView.endpointConsent.test.tsx src/features/btc/BtcView.spentness.test.tsx src/features/btc/BtcView.secrets.test.tsx src/features/btc/BtcView.headerOwnership.test.tsx src/features/btc/BtcView.persistence.test.tsx src/features/btc/BtcView.oracle.test.tsx
```

`bash scripts/scan-secrets.sh` passed. The source/tree preservation check and
`git diff --check` passed. The verified Git bundle retains the claim and product
history with recovery783 as prerequisite.

Fresh reviewer `/root/btc_guard_independent_review` separately reran the same125
cases across14 files: zero failures/skips,46.655 seconds. That overlap is a
separate review execution, not250 distinct tests. Its source review is pinned to
c503 and is not formal GitHub approval or an external security audit. Root retains
the independent packet and final integration decision.

The first author evidence-runner invocation failed during argument parsing
(exit2) before Vitest started. It is retained as an unexecuted failed attempt;
correcting argument order did not change any test.

## Dependency provenance and limits

Focused execution reused the qualified parent783 dependency and library outputs
read-only. All211 manifest, lockfile and TypeScript inputs matched that worktree;
every package source was identical. No installation or build occurred through the
temporary reuse link. It was removed after all focused processes ended.

The following checks remain **unexecuted by this author**: typed ESLint, original
full-web TypeScript check, full/lean build and artifact integrity, full-web
coverage, native Worker/browser execution and exact published-head hosted CI.
The coordinator explicitly deferred heavy local work while the retention worker
preserves its progressing coverage run. Hosted qualification must check the
published exact tree; these open gates are not passes.

New tests use ordinary supported lifecycle, API and scanner behavior. Existing
current refusal coverage ran unchanged. Donor-specific malformed-result
counterexample fixtures were not reconstructed or executed. Broader source,
contract, protocol and native-browser qualification remains the coordinator's
responsibility.

## Handoff

Root owns the next isolated publication as a child of #372, exact-source hosted
qualification, any corrective follow-up, ownership reconciliation and required
reviews/approvals. Source/test bytes are frozen; subsequent handoff changes are
documentation only and require exact-delta verification. Author source paths are
released and no local process remains.

No remote ref update, shared-target merge, integration-lock action, force push,
branch deletion, release, deployment, new fund-control contract or real-funds
operation occurred in this worker assignment.
