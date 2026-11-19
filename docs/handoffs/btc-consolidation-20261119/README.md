# Bitcoin historical and concurrent-source reconciliation — 2026-11-19

## Scope and source pins

This is a local reconciliation of existing Bitcoin functionality. It does not enable a new runtime profile,
change a protocol, add a dependency, alter generic SecretBackup or touch SOL/TRON callers. The coordinator owns
integration into the master candidate and qualification of that combined source.

| Source | Exact snapshot | Selection |
| --- | --- | --- |
| Master before this lane | `435c6e6bca463f83b6c55a2063f8c18c546c3c22` | TM13 per-request local spend detector, selected-output recheck before signing, current secret/review guards |
| Original PR #219 | `9617e8572f9bc414410bd937b0e7718d0c5bd55c` | `getSpends`, local block spends and persisted spent metadata via its #244 continuation |
| Earlier bounded repair | `befd696546020abfe2988ed8c49495b4e9a83f23` | Preserved independent provenance; consent mutation and unknown-state findings carried into this combined implementation |
| PR #244 reviewed core | `ef08170a83d86d194b8ce4186299e791027e461e` | Explicit revocable consent, strict coinbase metadata validation, worker/result/header ownership checks, distinct regressions |
| PR #244 advanced head | `2364284a2717a22b895fcb7badeb2e7ae6bb0e48` | `4a878e30` callback typing repair; historical qualification receipts remain source-scoped |
| PR #254 | `8c1d87a2587281c32a5f1326a4f36cfada4384bc` | Per-output coverage, canonical evidence revalidation, empty-result anchors, whole-list spend validation, stale-handler protections and distinct regressions |
| Later master inspected for conflicts | `260f094460b11ccc285b9cebf6a41148dbbe04cb` | Coordinator-owned #249/#251 changes must survive contextual integration; this branch was not rebased |

## Decisions grounded in source

`ScanStateMatch.spentCheckedThrough` records complete continuous block-input coverage for a particular output.
It advances only from the immediately previous block. A missing interval is not repaired merely by resuming.
New outputs can acquire coverage from their own discovery height even when older outputs have a gap. Legacy
version-1 records remain readable; the old global `spendsFromHeight` field grants no per-output authority.
Discovery, spend and coverage hashes are checked against the local header chain, including evidence outside the
recent rollback window. Reorganizations remove orphaned evidence and clamp retained coverage.

Full scans make optional per-outpoint requests only with explicit consent. Light scans require an unchecked,
revocable consent control before starting. Source, wallet and lock changes reset it. Consent is captured from the
serialized worker start request before an injected worker factory runs; both source dispatch and returned status
use that captured primitive. A later mutation of the caller's options cannot authorize disclosure or a provider-labelled
result. Matched-transaction proof endpoints require both light-mode permission and provider consent. A disposed
bridge cannot restart requests.

PR #254's `providerSpentCheck: effectiveLight || providerCheck`, checked/disabled light checkbox and removal of consent
resets in `BtcView.tsx` were deliberately not selected. Its worker result validator also omitted #244's request-range,
header-hash, duplicate-output and recovery-page checks; those #244 checks remain. #244's global coverage marker was
replaced by the per-output representation, not migrated into trusted coverage. #244's uint32 outpoint bound and
already-aborted dispatch refusal remain.

Unknown discoveries remain visible and unselected. They cannot be reviewed for sweeping until coverage or an
explicit provider check refreshes them. Empty unknown results do not claim that no unspent output exists. A retained
Sign/Broadcast handler reads the current scan ref and live header chain; local evidence must reach exactly the
current checked tip, including after a shortened chain load. Fee/review edits clear signing authority without
canceling an active header reconciliation after it has already changed the shared chain.

Master's `EsploraTweakSource.watchOutput`/`spendStatus` API and positive local spend detector remain. Raw consumed
outpoints are derived from the reserialized, header-bound transaction independently of tweak eligibility. A
contradictory JSON `is_coinbase` annotation is refused as `INVALID_RESPONSE`; #249's adversarial scenario remains a
rejection/no-provider-dispatch test. A separate valid untweakable-input test verifies that such spends are retained.
Before signing, the existing selected-output provider query still runs and refuses a reported spend. The UI and
verification text explicitly disclose this query separately from optional scan-time queries. No claim is made that
local coverage detects mempool spends or that a provider answer is proof.

## Regression provenance

- `scanWorker.test.ts` retains #244's range/header/history/duplicate checks and adds #254's proof-permission matrix,
  strict provider-status checks and invalid light-consent cases. Two new regressions mutate caller consent before
  factory return and after worker start, proving dispatch and acceptance use the same captured request policy.
- `scan.spentness-completion.test.ts` retains #254's partial completion, encrypted reloads, lagging-provider and empty
  anchor cases; a new case supplies a legacy global marker and proves it remains unknown.
- `scan.spends.test.ts` retains #244's discovery-identity binding, earliest spends, reorg rollback, historical sibling
  omission, query-count and aggregate-output cases. Legacy fixture construction now removes per-output markers.
- `state.test.ts` selects #254's per-output/gap/hash-consistency cases in place of tests tied to #244's removed global
  representation. Canonical first-spend and duplicate-outpoint behaviors remain covered. `scanner.test.ts` preserves
  #244's first watched-spend case plus #254's complete-list conflicting and later duplicate-spend cases.
- `BtcView.spentConsent`, `BtcView.spentness`, header ownership and secret tests preserve distinct revocation,
  source-switch, unknown selection, stale load, retained handler and fee-edit regressions. #254's forced-light UI
  expectation was replaced with the explicitly approved unchecked/revocable behavior. Empty-unknown wording has
  a separate regression.
- Both browser spent-consent/spentness scenarios remain in source. Their presence is not a browser execution claim.

## Observed local checks

| Group | Result | Evidence log |
| --- | --- | --- |
| Four new regressions against pre-repair reconciled #244 runtime | 4 expected failures; legacy marker incorrectly local, empty unknown wording, both consent mutations | `audit-data/btc244-red.log` |
| Worker, completion and consent suites | 52 passed, 3 files, 47.41 s | `audit-data/btc244-green-targeted.log` |
| Library state, scanner and header-source suites | 70 passed, 3 files, 11.10 s | `audit-data/btc244-library-green.log` |
| Core web scan/source/transport/storage/sweep/disclosure suites | 170 passed, 13 files, 98.47 s | `audit-data/btc244-web-core-green.log` |
| Component/header ownership/signing suites | 74 passed plus 1 old wording assertion failed; after updating only that assertion, affected file 14/14 passed. All 75 distinct component cases pass. | `audit-data/btc244-web-components-green.log`, `audit-data/btc244-web-components-rerun.log` |
| BTC package typecheck | Passed with the package tsconfig and `--noEmit` | `audit-data/btc244-library-typecheck.log` |
| Broader aliased web runtime typecheck | Interrupted without diagnostics after exceeding this bounded window; exit 130, not qualified | `audit-data/btc244-runtime-typecheck.log` |
| Committed-secret scan and whitespace check | Passed | `bash scripts/scan-secrets.sh`; `git diff --cached --check` |

RED source tree: `5285e9f6552b200d02563d6c99b8865134791e34`.
First GREEN source tree: `379368b7769486da3999490e7aef41ed28651e92`.
Core/library source tree, including the #249 reconciliation cases: `2b7fb4fae9e59b27b152bdc309a8fc44a74e33fb`.
Component assertion/browser helper repair source tree: `b18ee08c14d6f2251b87783ef126c83f48d2ba45`.
All **367 distinct focused tests** pass across 24 BTC web test files and three library scan test files.
These are local Git tree objects, not assertions that later master integration has been tested.

Tests used Node `v24.22.3`, master-installed Vitest `5.1.0`, one fork worker, file parallelism disabled and
`NODE_OPTIONS=--max-old-space-size=768`. Temporary minimal configs map exact `@ghostpay` exports to this worktree's
source and borrow installed third-party dependencies from `GhostPay-master`; they do not test rebuilt package
exports or constitute a clean-lock install/full hosted gate. No dependency installation or shared library build was
performed by this lane. Logs/configs are in the coordinator's workspace `audit-data` directory.

## Master integration cautions and remaining qualification

Preserve #251 `authorizedOperationFetch` for each `btc-scan`/`btc-sweep` operation, captured abort signals, oracle
indexer scopes and network-revision invalidation. Keep the worker's captured consent gate inside that operation
scope: an authorized RPC origin is not consent for an outpoint disclosure. Keep the selected-output recheck as
`client(signal, 'btc-sweep')` and the abortable broadcast call.

Retain the #251 bounded Esplora request/response handling and already-aborted refusal. #244 adds
`EsploraHttpError` for explicit HTTP status; if bounded-request integration catches it, preserve that class/status
instead of flattening it into a generic transport failure. It currently has no runtime decision-making caller, but
the source contract and regression remain intentional.

No full clean install, complete package rebuild, successful web runtime typecheck, full-repository typecheck/lint/coverage, production bundle/browser,
external Bitcoin node, native-language review or device acceptance is claimed. Source-owned historical qualification
receipts under `btc-spent-20261118` describe their original snapshot, not this reconciliation or later master.

## Commands and evidence scope

All test invocations used `NODE_OPTIONS=--max-old-space-size=768 node ../GhostPay-master/node_modules/vitest/vitest.mjs run`
with the absolute tool path, the appropriate `audit-data/btc244-{web,library}.vitest.config.mts`, explicit test files,
`--coverage=false --maxWorkers=1 --reporter=verbose`. The library config ran from `packages/btc-silent-payments`;
web groups ran from `apps/web`. The RED filter was:

```text
captures outpoint consent|does not authorize a provider-labelled result by mutating|reads old global coverage|does not describe an empty unknown range
```

Library typecheck: `NODE_OPTIONS=--max-old-space-size=768 node ../GhostPay-master/node_modules/typescript/bin/tsc -p packages/btc-silent-payments/tsconfig.json --noEmit` from this checkout, with the absolute tool path.
The interrupted broader check instead used `audit-data/btc244-runtime.tsconfig.json`, which aliases workspace
imports to current source. Check/config hashes and changed-source blob pins are in `selection.json`.

The original #244 qualification documents retained in `../btc-spent-20261118/` are historical, source-pinned
evidence. Their Node/build/browser claims do not qualify this combined reconciliation.
